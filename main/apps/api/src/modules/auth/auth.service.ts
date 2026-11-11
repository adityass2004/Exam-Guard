import { UserRole } from '@prisma/client';
import { defaultClock, type Clock } from '../../lib/clock.js';
import { AppError } from '../../lib/errors.js';
import { dummyVerify, hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/audit.service.js';
import { sessionService } from './session.service.js';
import type {
  AuthResponseData,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
} from '@examguard/shared';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export class AuthService {
  constructor(private clock: Clock = defaultClock) {}

  async registerStudent(
    input: RegisterInput,
    requestId?: string,
    ip?: string,
  ): Promise<AuthResponseData> {
    const email = input.email.toLowerCase().trim();
    const studentId = input.studentId.trim();

    // Check duplicate email
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new AppError('EMAIL_TAKEN', 409, 'An account with this email address already exists');
    }

    // Check duplicate studentId
    const existingProfile = await prisma.studentProfile.findUnique({
      where: { studentId },
    });
    if (existingProfile) {
      throw new AppError(
        'STUDENT_ID_TAKEN',
        409,
        'An account with this student ID already exists',
      );
    }

    const passwordHash = await hashPassword(input.password);
    const now = this.clock.now();

    const { user, profile } = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          fullName: input.fullName.trim(),
          passwordHash,
          role: UserRole.STUDENT,
          createdAt: now,
          updatedAt: now,
        },
      });

      const p = await tx.studentProfile.create({
        data: {
          userId: u.id,
          studentId,
          createdAt: now,
          updatedAt: now,
        },
      });

      return { user: u, profile: p };
    });

    await auditService.record({
      actorUserId: user.id,
      actorRole: UserRole.STUDENT,
      action: 'AUTH_REGISTER',
      entityType: 'User',
      entityId: user.id,
      after: { email: user.email, role: user.role, studentId: profile.studentId },
      requestId,
      ip,
    });

    return {
      user: {
        id: user.id,
        role: user.role,
        fullName: user.fullName,
        email: user.email,
        studentId: profile.studentId,
        enrollmentStatus: null,
      },
    };
  }

  async login(
    input: LoginInput,
    expectedRole: UserRole,
    csrfTokenHash: string,
    userAgent?: string,
    requestId?: string,
    ip?: string,
  ): Promise<{ authData: AuthResponseData; rawToken: string }> {
    const email = input.email.toLowerCase().trim();
    const now = this.clock.now();

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        studentProfile: {
          select: {
            studentId: true,
            enrollmentStatusCache: true,
          },
        },
      },
    });

    // Timing mitigation for non-existent user
    if (!user) {
      await dummyVerify();
      await auditService.record({
        actorRole: expectedRole,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        after: { reason: 'USER_NOT_FOUND', attemptedRole: expectedRole },
        requestId,
        ip,
      });
      throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
    }

    // Lockout check
    if (user.lockedUntil && user.lockedUntil > now) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000);
      throw new AppError(
        'ACCOUNT_LOCKED',
        423,
        `Account is temporarily locked. Please try again in ${remainingMinutes} minute(s).`,
      );
    }

    // Role check and status check
    const isRoleMatch = user.role === expectedRole;
    const isPasswordValid = await verifyPassword(input.password, user.passwordHash);

    if (!isPasswordValid || !isRoleMatch || user.status !== 'ACTIVE' || user.deletedAt !== null) {
      const newFailedCount = user.failedLoginCount + 1;
      let newLockedUntil: Date | null = null;

      if (newFailedCount >= MAX_FAILED_ATTEMPTS) {
        newLockedUntil = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: newFailedCount,
          lockedUntil: newLockedUntil,
        },
      });

      await auditService.record({
        actorUserId: user.id,
        actorRole: expectedRole,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        after: {
          reason: !isRoleMatch ? 'ROLE_MISMATCH' : 'BAD_PASSWORD',
          failedAttempts: newFailedCount,
        },
        requestId,
        ip,
      });

      if (newLockedUntil) {
        throw new AppError(
          'ACCOUNT_LOCKED',
          423,
          `Account is temporarily locked after ${MAX_FAILED_ATTEMPTS} failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
        );
      }

      throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
    }

    // Successful login: reset failed counters and update lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
      },
    });

    // Create a new session (session fixation protection)
    const { rawToken } = await sessionService.createSession(user.id, csrfTokenHash, userAgent);

    await auditService.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: user.id,
      after: { email: user.email, role: user.role },
      requestId,
      ip,
    });

    return {
      rawToken,
      authData: {
        user: {
          id: user.id,
          role: user.role,
          fullName: user.fullName,
          email: user.email,
          studentId: user.studentProfile?.studentId,
          enrollmentStatus: user.studentProfile?.enrollmentStatusCache,
          mustChangePassword: user.mustChangePassword,
        },
      },
    };
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    input: ChangePasswordInput,
    requestId?: string,
    ip?: string,
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('UNAUTHENTICATED', 401, 'User not found');
    }

    const isCurrentValid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new AppError('INVALID_CREDENTIALS', 400, 'Current password is incorrect');
    }

    const newHash = await hashPassword(input.newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
      },
    });

    // Revoke all other active sessions of this user
    await sessionService.revokeAllUserSessions(userId, currentSessionId);

    await auditService.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: user.id,
      requestId,
      ip,
    });
  }
}

export const authService = new AuthService();


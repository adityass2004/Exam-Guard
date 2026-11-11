import type { Response } from 'express';
import type { AuthSession, User } from '@prisma/client';
import { env } from '../../config/env.js';
import { defaultClock, type Clock } from '../../lib/clock.js';
import { generateToken, hashToken } from '../../lib/ids.js';
import { prisma } from '../../lib/prisma.js';

export const SESSION_COOKIE_NAME = 'eg_session';

export interface SessionWithUser extends AuthSession {
  user: User & {
    studentProfile?: {
      studentId: string;
      enrollmentStatusCache: string | null;
    } | null;
  };
}

export class SessionService {
  constructor(private clock: Clock = defaultClock) {}

  async createSession(
    userId: string,
    csrfTokenHash: string,
    userAgent?: string,
  ): Promise<{ rawToken: string; session: AuthSession }> {
    const rawToken = generateToken(32);
    const tokenHash = hashToken(rawToken);

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + env.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000);

    const session = await prisma.authSession.create({
      data: {
        userId,
        tokenHash,
        csrfTokenHash,
        createdAt: now,
        lastUsedAt: now,
        expiresAt,
        userAgent: userAgent?.slice(0, 512) || null,
      },
    });

    return { rawToken, session };
  }

  async getValidSession(rawToken: string): Promise<SessionWithUser | null> {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    const tokenHash = hashToken(rawToken);
    const now = this.clock.now();

    const session = await prisma.authSession.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            studentProfile: {
              select: {
                studentId: true,
                enrollmentStatusCache: true,
              },
            },
          },
        },
      },
    });

    if (!session || session.revokedAt) {
      return null;
    }

    // Absolute lifetime check
    if (now > session.expiresAt) {
      return null;
    }

    // Idle timeout check
    const idleLimitMs = env.SESSION_IDLE_MINUTES * 60 * 1000;
    if (now.getTime() - session.lastUsedAt.getTime() > idleLimitMs) {
      return null;
    }

    // Check user status and soft delete
    if (session.user.status !== 'ACTIVE' || session.user.deletedAt !== null) {
      return null;
    }

    // Throttled sliding update of lastUsedAt (once every 60s)
    if (now.getTime() - session.lastUsedAt.getTime() > 60 * 1000) {
      await prisma.authSession.update({
        where: { id: session.id },
        data: { lastUsedAt: now },
      });
      session.lastUsedAt = now;
    }

    return session;
  }

  async revokeSession(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await prisma.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  async revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
    await prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: this.clock.now() },
    });
  }

  setSessionCookie(res: Response, rawToken: string): void {
    const isProd = env.NODE_ENV === 'production';
    res.cookie(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: env.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000,
    });
  }

  clearSessionCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      path: '/',
    });
  }
}

export const sessionService = new SessionService();


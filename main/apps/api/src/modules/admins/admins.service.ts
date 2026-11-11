import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { auditService } from '../audit/audit.service.js';

export class AdminsService {
  async listAdmins() {
    return await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createAdmin(
    input: { email: string; fullName: string },
    creatorUserId: string
  ): Promise<{ admin: any; temporaryPassword: string }> {
    const email = input.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError('CONFLICT', 409, 'An account with this email address already exists');
    }

    // Generate strong 16-char temporary password
    const temporaryPassword = `Tmp!${crypto.randomBytes(9).toString('base64url')}9#`;
    const passwordHash = await hashPassword(temporaryPassword);

    const admin = await prisma.user.create({
      data: {
        email,
        fullName: input.fullName.trim(),
        role: 'ADMIN',
        status: 'ACTIVE',
        passwordHash,
        mustChangePassword: true,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    await auditService.recordAudit({
      actorUserId: creatorUserId,
      actorRole: 'ADMIN',
      action: 'ADMIN_CREATED',
      entityType: 'USER',
      entityId: admin.id,
      details: { email: admin.email, fullName: admin.fullName },
    });

    return {
      admin,
      temporaryPassword,
    };
  }

  async deactivateAdmin(adminIdToDeactivate: string, requestingAdminId: string): Promise<any> {
    if (adminIdToDeactivate === requestingAdminId) {
      throw new AppError('FORBIDDEN', 403, 'You cannot deactivate your own admin account');
    }

    const targetAdmin = await prisma.user.findUnique({
      where: { id: adminIdToDeactivate, role: 'ADMIN' },
    });
    if (!targetAdmin) {
      throw new AppError('NOT_FOUND', 404, 'Admin account not found');
    }

    const activeAdminsCount = await prisma.user.count({
      where: { role: 'ADMIN', status: 'ACTIVE' },
    });

    if (activeAdminsCount <= 1) {
      throw new AppError('CONFLICT', 409, 'Cannot deactivate the last active administrator');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.user.update({
        where: { id: adminIdToDeactivate },
        data: { status: 'SUSPENDED' },
        select: {
          id: true,
          email: true,
          fullName: true,
          status: true,
        },
      });

      // Revoke all active sessions immediately
      await tx.authSession.deleteMany({
        where: { userId: adminIdToDeactivate },
      });

      return res;
    });

    await auditService.recordAudit({
      actorUserId: requestingAdminId,
      actorRole: 'ADMIN',
      action: 'ADMIN_DEACTIVATED',
      entityType: 'USER',
      entityId: adminIdToDeactivate,
      details: { email: targetAdmin.email },
    });

    return updated;
  }
}

export const adminsService = new AdminsService();


import { Prisma } from '@prisma/client';
import {
  CreateVerificationSettingsDto,
  VerificationSettingsDto,
  VerificationSettingsHistoryDto,
} from '@examguard/shared';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

export function formatVerificationSettingsDto(setting: any): VerificationSettingsDto {
  return {
    id: setting.id,
    version: setting.version,
    isActive: setting.isActive,
    name: setting.name,
    thresholdPct: setting.thresholdPct,
    intervalMs: setting.intervalMs,
    consecutiveMismatchLimit: setting.consecutiveMismatchLimit,
    missingFaceLimit: setting.missingFaceLimit,
    multipleFacesPolicy: setting.multipleFacesPolicy,
    multipleFacesConsecutiveLimit: setting.multipleFacesConsecutiveLimit,
    cameraFailurePolicy: setting.cameraFailurePolicy,
    cameraGraceSeconds: setting.cameraGraceSeconds,
    serviceFailureLimit: setting.serviceFailureLimit,
    repeatedFailureLimit: setting.repeatedFailureLimit,
    recoveryMatchCount: setting.recoveryMatchCount,
    startupGraceSeconds: setting.startupGraceSeconds,
    preExamRequiredMatches: setting.preExamRequiredMatches,
    minFaceQuality: setting.minFaceQuality as any,
    severityRules: setting.severityRules as any,
    changeNote: setting.changeNote,
    createdBy: {
      id: setting.creator?.id ?? setting.createdBy,
      fullName: setting.creator?.fullName ?? 'Administrator',
      email: setting.creator?.email ?? 'admin@examguard.local',
    },
    createdAt: setting.createdAt.toISOString(),
  };
}

export class VerificationSettingsService {
  async getActiveSettings(): Promise<VerificationSettingsDto | null> {
    const active = await prisma.verificationSetting.findFirst({
      where: { isActive: true },
      include: {
        creator: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!active) return null;
    return formatVerificationSettingsDto(active);
  }

  async getSettingsHistory(): Promise<VerificationSettingsHistoryDto> {
    const all = await prisma.verificationSetting.findMany({
      orderBy: { version: 'desc' },
      include: {
        creator: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    const activeItem = all.find((s) => s.isActive);
    return {
      active: activeItem ? formatVerificationSettingsDto(activeItem) : null,
      history: all.map(formatVerificationSettingsDto),
    };
  }

  async createSettingsVersion(
    adminUserId: string,
    dto: CreateVerificationSettingsDto
  ): Promise<VerificationSettingsDto> {
    return await prisma.$transaction(async (tx) => {
      // 1. Find previous active settings
      const previousActive = await tx.verificationSetting.findFirst({
        where: { isActive: true },
        include: {
          creator: { select: { id: true, fullName: true, email: true } },
        },
      });

      // 2. Query highest version number
      const highestVersion = await tx.verificationSetting.findFirst({
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (highestVersion?.version ?? 0) + 1;

      // 3. Atomically deactivate currently active versions
      await tx.verificationSetting.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      // 4. Create new immutable version
      const created = await tx.verificationSetting.create({
        data: {
          version: nextVersion,
          isActive: true,
          name: dto.name ?? null,
          thresholdPct: dto.thresholdPct,
          intervalMs: dto.intervalMs,
          consecutiveMismatchLimit: dto.consecutiveMismatchLimit,
          missingFaceLimit: dto.missingFaceLimit,
          multipleFacesPolicy: dto.multipleFacesPolicy,
          multipleFacesConsecutiveLimit: dto.multipleFacesConsecutiveLimit,
          cameraFailurePolicy: dto.cameraFailurePolicy,
          cameraGraceSeconds: dto.cameraGraceSeconds,
          serviceFailureLimit: dto.serviceFailureLimit,
          repeatedFailureLimit: dto.repeatedFailureLimit,
          recoveryMatchCount: dto.recoveryMatchCount,
          startupGraceSeconds: dto.startupGraceSeconds,
          preExamRequiredMatches: dto.preExamRequiredMatches,
          minFaceQuality: dto.minFaceQuality as any,
          severityRules: dto.severityRules as any,
          createdBy: adminUserId,
          changeNote: dto.changeNote,
        },
        include: {
          creator: { select: { id: true, fullName: true, email: true } },
        },
      });

      const formattedNew = formatVerificationSettingsDto(created);
      const formattedOld = previousActive ? formatVerificationSettingsDto(previousActive) : null;

      // 5. Audit log SETTINGS_CHANGED
      await tx.adminAuditLog.create({
        data: {
          actorUserId: adminUserId,
          actorRole: 'ADMIN',
          action: 'SETTINGS_CHANGED',
          entityType: 'VerificationSetting',
          entityId: created.id,
          before: formattedOld ? (formattedOld as any) : Prisma.JsonNull,
          after: formattedNew as any,
        },
      });

      return formattedNew;
    });
  }
}

export const verificationSettingsService = new VerificationSettingsService();

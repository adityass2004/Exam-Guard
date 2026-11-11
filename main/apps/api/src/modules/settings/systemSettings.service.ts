import { prisma } from '../../lib/prisma.js';
import { auditService } from '../audit/audit.service.js';

export interface SystemSettingsDto {
  requireEnrollmentApproval: boolean;
  retentionEnrollmentImagesDays: number;
  retentionEvidenceDays: number;
  retentionVerificationLogsDays: number;
  retentionAuditLogsDays: number;
  consentPolicyVersion: string;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsDto = {
  requireEnrollmentApproval: true,
  retentionEnrollmentImagesDays: 365,
  retentionEvidenceDays: 90,
  retentionVerificationLogsDays: 180,
  retentionAuditLogsDays: 730,
  consentPolicyVersion: '1.0',
};

export class SystemSettingsService {
  async getSettings(): Promise<SystemSettingsDto> {
    const rows = await prisma.systemSetting.findMany();
    const map = new Map<string, any>();
    for (const r of rows) {
      map.set(r.key, r.value);
    }

    return {
      requireEnrollmentApproval:
        map.has('require_enrollment_approval')
          ? Boolean(map.get('require_enrollment_approval'))
          : DEFAULT_SYSTEM_SETTINGS.requireEnrollmentApproval,
      retentionEnrollmentImagesDays:
        map.has('retention_enrollment_images_days')
          ? Number(map.get('retention_enrollment_images_days'))
          : DEFAULT_SYSTEM_SETTINGS.retentionEnrollmentImagesDays,
      retentionEvidenceDays:
        map.has('retention_evidence_days')
          ? Number(map.get('retention_evidence_days'))
          : DEFAULT_SYSTEM_SETTINGS.retentionEvidenceDays,
      retentionVerificationLogsDays:
        map.has('retention_verification_logs_days')
          ? Number(map.get('retention_verification_logs_days'))
          : DEFAULT_SYSTEM_SETTINGS.retentionVerificationLogsDays,
      retentionAuditLogsDays:
        map.has('retention_audit_logs_days')
          ? Number(map.get('retention_audit_logs_days'))
          : DEFAULT_SYSTEM_SETTINGS.retentionAuditLogsDays,
      consentPolicyVersion:
        map.has('consent_policy_version')
          ? String(map.get('consent_policy_version'))
          : DEFAULT_SYSTEM_SETTINGS.consentPolicyVersion,
    };
  }

  async updateSettings(
    newSettings: Partial<SystemSettingsDto>,
    adminUserId: string
  ): Promise<SystemSettingsDto> {
    const before = await this.getSettings();

    const updates: [string, any][] = [];
    if (newSettings.requireEnrollmentApproval !== undefined) {
      updates.push(['require_enrollment_approval', newSettings.requireEnrollmentApproval]);
    }
    if (newSettings.retentionEnrollmentImagesDays !== undefined) {
      updates.push(['retention_enrollment_images_days', Math.max(0, newSettings.retentionEnrollmentImagesDays)]);
    }
    if (newSettings.retentionEvidenceDays !== undefined) {
      updates.push(['retention_evidence_days', Math.max(0, newSettings.retentionEvidenceDays)]);
    }
    if (newSettings.retentionVerificationLogsDays !== undefined) {
      updates.push(['retention_verification_logs_days', Math.max(0, newSettings.retentionVerificationLogsDays)]);
    }
    if (newSettings.retentionAuditLogsDays !== undefined) {
      updates.push(['retention_audit_logs_days', Math.max(0, newSettings.retentionAuditLogsDays)]);
    }
    if (newSettings.consentPolicyVersion !== undefined) {
      updates.push(['consent_policy_version', newSettings.consentPolicyVersion.trim()]);
    }

    await prisma.$transaction(async (tx) => {
      for (const [key, value] of updates) {
        await tx.systemSetting.upsert({
          where: { key },
          update: { value, updatedBy: adminUserId },
          create: { key, value, updatedBy: adminUserId },
        });
      }
    });

    const after = await this.getSettings();

    await auditService.recordAudit({
      actorUserId: adminUserId,
      actorRole: 'ADMIN',
      action: 'SYSTEM_SETTINGS_UPDATED',
      entityType: 'SYSTEM_SETTINGS',
      details: {
        before,
        after,
        updatedKeys: updates.map(([k]) => k),
      },
    });

    return after;
  }
}

export const systemSettingsService = new SystemSettingsService();


import { prisma } from '../../../lib/prisma.js';
import { auditService } from '../../audit/audit.service.js';
import type { SystemSettingsDto } from '@examguard/shared';

const DEFAULTS = {
  requireEnrollmentApproval: true,
  retentionEnrollmentImagesDays: 365,
  retentionEvidenceDays: 90,
  retentionVerificationLogsDays: 180,
  retentionAuditLogsDays: 730,
  consentPolicyVersion: '1.0',
};

export class AdminSystemSettingsService {
  async getSettings(): Promise<SystemSettingsDto> {
    const rows = await prisma.systemSetting.findMany();
    const map = new Map<string, any>();
    for (const r of rows) {
      const val = r.value as { value?: any } | any;
      map.set(r.key, typeof val === 'object' && val !== null && 'value' in val ? val.value : val);
    }

    const latest = rows.reduce<Date | null>((acc, r) => (!acc || r.updatedAt > acc ? r.updatedAt : acc), null);
    const lastUpdater = rows.length > 0 ? rows[0].updatedBy : null;

    return {
      requireEnrollmentApproval: map.has('require_enrollment_approval')
        ? Boolean(map.get('require_enrollment_approval'))
        : DEFAULTS.requireEnrollmentApproval,
      retentionEnrollmentImagesDays: map.has('retention_enrollment_images_days')
        ? Number(map.get('retention_enrollment_images_days'))
        : DEFAULTS.retentionEnrollmentImagesDays,
      retentionEvidenceDays: map.has('retention_evidence_days')
        ? Number(map.get('retention_evidence_days'))
        : DEFAULTS.retentionEvidenceDays,
      retentionVerificationLogsDays: map.has('retention_verification_logs_days')
        ? Number(map.get('retention_verification_logs_days'))
        : DEFAULTS.retentionVerificationLogsDays,
      retentionAuditLogsDays: map.has('retention_audit_logs_days')
        ? Number(map.get('retention_audit_logs_days'))
        : DEFAULTS.retentionAuditLogsDays,
      consentPolicyVersion: map.has('consent_policy_version')
        ? String(map.get('consent_policy_version'))
        : DEFAULTS.consentPolicyVersion,
      updatedAt: latest?.toISOString(),
      updatedBy: lastUpdater,
    };
  }

  async updateSettings(
    input: Partial<SystemSettingsDto>,
    adminUserId: string,
    reqIp?: string,
    requestId?: string
  ): Promise<SystemSettingsDto> {
    const before = await this.getSettings();

    const updates: [string, any][] = [];
    if (input.requireEnrollmentApproval !== undefined) {
      updates.push(['require_enrollment_approval', { value: input.requireEnrollmentApproval }]);
    }
    if (input.retentionEnrollmentImagesDays !== undefined) {
      updates.push(['retention_enrollment_images_days', { value: input.retentionEnrollmentImagesDays }]);
    }
    if (input.retentionEvidenceDays !== undefined) {
      updates.push(['retention_evidence_days', { value: input.retentionEvidenceDays }]);
    }
    if (input.retentionVerificationLogsDays !== undefined) {
      updates.push(['retention_verification_logs_days', { value: input.retentionVerificationLogsDays }]);
    }
    if (input.retentionAuditLogsDays !== undefined) {
      updates.push(['retention_audit_logs_days', { value: input.retentionAuditLogsDays }]);
    }
    if (input.consentPolicyVersion !== undefined) {
      updates.push(['consent_policy_version', { value: input.consentPolicyVersion }]);
    }

    await prisma.$transaction(async (tx) => {
      for (const [key, value] of updates) {
        await tx.systemSetting.upsert({
          where: { key },
          create: {
            key,
            value,
            updatedBy: adminUserId,
          },
          update: {
            value,
            updatedBy: adminUserId,
          },
        });
      }
    });

    const after = await this.getSettings();

    await auditService.recordAudit({
      actorUserId: adminUserId,
      actorRole: 'ADMIN',
      action: 'SYSTEM_SETTINGS_UPDATE',
      entityType: 'SYSTEM_SETTINGS',
      details: {
        before,
        after,
        updatedKeys: updates.map(([k]) => k),
      },
      ipAddress: reqIp,
      requestId,
    });

    return after;
  }
}

export const adminSystemSettingsService = new AdminSystemSettingsService();

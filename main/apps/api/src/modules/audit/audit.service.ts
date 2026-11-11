import { Prisma, type UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { sha256Hex } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'tokenhash',
  'cookie',
  'authorization',
  'embedding',
  'frame',
  'image',
  'ciphertext',
]);

export function scrubAuditJson(data: unknown): Prisma.InputJsonValue | undefined {
  if (data === undefined || data === null) {
    return undefined;
  }

  if (typeof data !== 'object') {
    return data as Prisma.InputJsonValue;
  }

  if (Array.isArray(data)) {
    return data.map(scrubAuditJson) as Prisma.InputJsonValue;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('token')) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      cleaned[key] = scrubAuditJson(val);
    } else {
      cleaned[key] = val;
    }
  }

  return cleaned as Prisma.InputJsonValue;
}

export interface AuditRecordParams {
  actorUserId?: string | null;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string;
  ip?: string;
}

export class AuditService {
  async record(params: AuditRecordParams & { reqIp?: string }): Promise<void> {
    try {
      const ip = params.ip || params.reqIp;
      const ipHash = ip ? sha256Hex(`eg_salt_${ip}`) : null;
      const cleanBefore = scrubAuditJson(params.before);
      const cleanAfter = scrubAuditJson(params.after);

      await prisma.adminAuditLog.create({
        data: {
          actorUserId: params.actorUserId || null,
          actorRole: params.actorRole,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId || null,
          before: cleanBefore ?? Prisma.JsonNull,
          after: cleanAfter ?? Prisma.JsonNull,
          requestId: params.requestId || null,
          ipHash,
        },
      });
    } catch (err) {
      logger.error({ err, action: params.action }, 'Failed to record audit log');
      // Do not rethrow audit failure in main business flows unless required
    }
  }

  async log(params: AuditRecordParams & { reqIp?: string }): Promise<void> {
    return this.record(params);
  }

  async recordAudit(params: AuditRecordParams & { details?: any; [key: string]: any }): Promise<void> {
    const after = params.after || params.details;
    return this.record({ ...params, after });
  }

  async recordStrict(params: AuditRecordParams & { reqIp?: string }): Promise<void> {
    const ip = params.ip || params.reqIp;
    const ipHash = ip ? sha256Hex(`eg_salt_${ip}`) : null;
    const cleanBefore = scrubAuditJson(params.before);
    const cleanAfter = scrubAuditJson(params.after);

    await prisma.adminAuditLog.create({
      data: {
        actorUserId: params.actorUserId || null,
        actorRole: params.actorRole,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || null,
        before: cleanBefore ?? Prisma.JsonNull,
        after: cleanAfter ?? Prisma.JsonNull,
        requestId: params.requestId || null,
        ipHash,
      },
    });
  }
}

export const auditService = new AuditService();

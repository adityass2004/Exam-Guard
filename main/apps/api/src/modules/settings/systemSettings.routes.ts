import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { systemSettingsService } from './systemSettings.service.js';

export const systemSettingsRouter = Router();

systemSettingsRouter.use(requireAuth, requireRole('ADMIN'));

const updateSystemSettingsSchema = z.object({
  requireEnrollmentApproval: z.boolean().optional(),
  retentionEnrollmentImagesDays: z.number().int().min(0).max(3650).optional(),
  retentionEvidenceDays: z.number().int().min(0).max(3650).optional(),
  retentionVerificationLogsDays: z.number().int().min(0).max(3650).optional(),
  retentionAuditLogsDays: z.number().int().min(0).max(3650).optional(),
  consentPolicyVersion: z.string().min(1).max(20).optional(),
});

systemSettingsRouter.get('/', async (_req, res, next) => {
  try {
    const settings = await systemSettingsService.getSettings();
    res.status(200).json({ data: settings });
  } catch (err) {
    next(err);
  }
});

systemSettingsRouter.put('/', async (req, res, next) => {
  try {
    const parsed = updateSystemSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid system settings payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const updated = await systemSettingsService.updateSettings(parsed.data, req.user!.id);
    res.status(200).json({ data: updated });
    return;
  } catch (err) {
    next(err);
  }
});


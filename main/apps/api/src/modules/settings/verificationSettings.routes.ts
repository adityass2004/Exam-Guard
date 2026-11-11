import { Router, Request, Response, NextFunction } from 'express';
import { createVerificationSettingsSchema } from '@examguard/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { AppError } from '../../lib/errors.js';
import { verificationSettingsService } from './verificationSettings.service.js';

export const verificationSettingsRoutes = Router();

/**
 * GET /api/v1/admin/verification-settings
 * Returns current active verification settings configuration and version history.
 */
verificationSettingsRoutes.get(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const history = await verificationSettingsService.getSettingsHistory();
      return res.status(200).json({
        success: true,
        data: history,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/v1/admin/verification-settings
 * Creates a new immutable verification settings version and deactivates the previous active one.
 */
verificationSettingsRoutes.post(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  csrfProtection,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createVerificationSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          400,
          parsed.error.errors.map((e) => e.message).join('; ')
        );
      }

      const created = await verificationSettingsService.createSettingsVersion(
        req.user!.id,
        parsed.data
      );

      return res.status(201).json({
        success: true,
        data: created,
      });
    } catch (err) {
      return next(err);
    }
  }
);

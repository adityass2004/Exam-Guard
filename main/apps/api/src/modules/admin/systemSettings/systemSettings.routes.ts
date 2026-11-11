import { Router } from 'express';
import { updateSystemSettingsSchema } from '@examguard/shared';
import { adminSystemSettingsService } from './systemSettings.service.js';

export const systemSettingsRouter = Router();

/**
 * GET /admin/system-settings
 * View core administrative system settings and retention rules.
 */
systemSettingsRouter.get('/system-settings', async (_req, res, next) => {
  try {
    const data = await adminSystemSettingsService.getSettings();
    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
});

const handleUpdate = async (req: any, res: any, next: any) => {
  try {
    const parsed = updateSystemSettingsSchema.parse(req.body);
    const adminUserId = req.user!.id;
    const reqIp = req.ip || req.socket.remoteAddress;
    const reqId = (req as unknown as { id?: string }).id;

    const data = await adminSystemSettingsService.updateSettings(
      parsed,
      adminUserId,
      reqIp,
      reqId
    );

    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /admin/system-settings
 */
systemSettingsRouter.patch('/system-settings', handleUpdate);

/**
 * PUT /admin/system-settings
 */
systemSettingsRouter.put('/system-settings', handleUpdate);

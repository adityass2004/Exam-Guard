import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { monitoringService } from './monitoring.service.js';

export const monitoringRouter = Router();

monitoringRouter.use(requireAuth, requireRole('ADMIN'));

monitoringRouter.get('/sessions', async (_req, res, next) => {
  try {
    const snapshot = await monitoringService.getMonitoringSnapshot();
    res.status(200).json({ data: snapshot });
  } catch (err) {
    next(err);
  }
});

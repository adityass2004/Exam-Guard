import { Router } from 'express';
import { adminDashboardService } from './dashboard.service.js';

export const dashboardRouter = Router();

/**
 * GET /admin/dashboard
 * Aggregated administrative metrics, pending enrollments, and recent audit activity.
 */
dashboardRouter.get('/dashboard', async (_req, res, next) => {
  try {
    const data = await adminDashboardService.getDashboardData();
    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
});

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { enrollmentRouter } from '../enrollment/enrollment.routes.js';
import { studentDashboardService } from './dashboard.service.js';
import { studentExamsRouter, studentSessionsRouter } from '../sessions/sessions.routes.js';

export const studentRouter = Router();

// Protect all /student routes with requireAuth and requireRole('STUDENT')
studentRouter.use(requireAuth, requireRole('STUDENT'));

// Initial probe endpoint used for role verification
studentRouter.get('/ping', (req, res) => {
  res.status(200).json({
    data: {
      message: 'Student router online',
      userId: req.user?.id,
      role: req.user?.role,
    },
  });
});

// GET /student/dashboard
studentRouter.get('/dashboard', async (req, res, next) => {
  try {
    const data = await studentDashboardService.getDashboardData(req.user!.id);
    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
});

// Mount multi-angle enrollment and consent sub-routes
studentRouter.use(enrollmentRouter);

// Mount exam and session sub-routes
studentRouter.use('/exams', studentExamsRouter);
studentRouter.use('/sessions', studentSessionsRouter);

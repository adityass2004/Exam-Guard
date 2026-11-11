import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { imagesRouter } from '../images/images.routes.js';
import { auditRouter } from './audit/audit.routes.js';
import { dashboardRouter } from './dashboard/dashboard.routes.js';
import { deletionRouter } from './deletion/deletion.routes.js';
import { enrollmentsRouter } from './enrollments/enrollments.routes.js';
import { galleryRouter } from './gallery/gallery.routes.js';
import { studentsRouter } from './students/students.routes.js';
import { systemSettingsRouter } from './systemSettings/systemSettings.routes.js';
import { adminExamsRouter } from '../exams/exams.routes.js';
import { verificationSettingsRoutes } from '../settings/verificationSettings.routes.js';
import { monitoringRouter } from '../monitoring/monitoring.routes.js';
import { incidentsRouter, sessionCancelRouter } from '../incidents/incidents.routes.js';
import { historyRouter } from '../history/history.routes.js';
import { reportsRouter } from '../reports/reports.routes.js';
import { retentionRouter } from '../retention/retention.routes.js';
import { adminsRouter } from '../admins/admins.routes.js';

export const adminRouter = Router();

// Protect all /admin routes with requireAuth and requireRole('ADMIN')
adminRouter.use(requireAuth, requireRole('ADMIN'));

// Initial probe endpoint used for role verification
adminRouter.get('/ping', (req, res) => {
  res.status(200).json({
    data: {
      message: 'Admin router online',
      userId: req.user?.id,
      role: req.user?.role,
    },
  });
});

// Protected image delivery
adminRouter.use('/images', imagesRouter);

// Admin dashboard
adminRouter.use(dashboardRouter);

// Student management
adminRouter.use(studentsRouter);

// Candidate face gallery
adminRouter.use(galleryRouter);

// Enrollment approval workflow
adminRouter.use(enrollmentsRouter);

// Data deletion workflow
adminRouter.use(deletionRouter);

// System settings
adminRouter.use(systemSettingsRouter);

// Exam management
adminRouter.use('/exams', adminExamsRouter);

// Verification settings
adminRouter.use('/verification-settings', verificationSettingsRoutes);

// Live monitoring & incidents
adminRouter.use('/monitoring', monitoringRouter);
adminRouter.use('/incidents', incidentsRouter);
adminRouter.use('/sessions', sessionCancelRouter);

// Verification history & reports
adminRouter.use('/verifications', historyRouter);
adminRouter.use('/reports', reportsRouter);

// Retention management
adminRouter.use('/retention', retentionRouter);

// Administrator management
adminRouter.use('/admins', adminsRouter);

// Audit viewer
adminRouter.use(auditRouter);

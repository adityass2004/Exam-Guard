import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { reportQuerySchema } from './reports.schemas.js';
import { reportsService } from './reports.service.js';
import { setCsvHeaders } from '../../lib/csv-stream.js';
import { auditService } from '../audit/audit.service.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole('ADMIN'));

reportsRouter.get('/overview', async (req, res, next) => {
  try {
    const parsed = reportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid report query parameters',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const data = await reportsService.getOverviewReport(parsed.data);

    if (parsed.data.format === 'csv') {
      setCsvHeaders(res, `report_overview_${Date.now()}.csv`);
      res.send(reportsService.toCsv('overview', data));
      await auditService.recordAudit({
        actorUserId: req.user!.id,
        actorRole: 'ADMIN',
        action: 'EXPORT_GENERATED',
        entityType: 'REPORT_OVERVIEW',
        details: { format: 'csv', filters: parsed.data },
      });
      return;
    }

    res.status(200).json({ data });
    return;
    return;
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/sessions', async (req, res, next) => {
  try {
    const parsed = reportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid report query parameters',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const data = await reportsService.getSessionsReport(parsed.data);

    if (parsed.data.format === 'csv') {
      setCsvHeaders(res, `report_sessions_${Date.now()}.csv`);
      res.send(reportsService.toCsv('sessions', data));
      await auditService.recordAudit({
        actorUserId: req.user!.id,
        actorRole: 'ADMIN',
        action: 'EXPORT_GENERATED',
        entityType: 'REPORT_SESSIONS',
        details: { format: 'csv', filters: parsed.data },
      });
      return;
    }

    res.status(200).json({ data });
    return;
    return;
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/students', async (req, res, next) => {
  try {
    const parsed = reportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid report query parameters',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const data = await reportsService.getStudentsReport(parsed.data);

    if (parsed.data.format === 'csv') {
      setCsvHeaders(res, `report_students_${Date.now()}.csv`);
      res.send(reportsService.toCsv('students', data));
      await auditService.recordAudit({
        actorUserId: req.user!.id,
        actorRole: 'ADMIN',
        action: 'EXPORT_GENERATED',
        entityType: 'REPORT_STUDENTS',
        details: { format: 'csv', filters: parsed.data },
      });
      return;
    }

    res.status(200).json({ data });
    return;
    return;
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/exams', async (req, res, next) => {
  try {
    const parsed = reportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid report query parameters',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const data = await reportsService.getExamsReport(parsed.data);

    if (parsed.data.format === 'csv') {
      setCsvHeaders(res, `report_exams_${Date.now()}.csv`);
      res.send(reportsService.toCsv('exams', data));
      await auditService.recordAudit({
        actorUserId: req.user!.id,
        actorRole: 'ADMIN',
        action: 'EXPORT_GENERATED',
        entityType: 'REPORT_EXAMS',
        details: { format: 'csv', filters: parsed.data },
      });
      return;
    }

    res.status(200).json({ data });
    return;
    return;
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/incidents', async (req, res, next) => {
  try {
    const parsed = reportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid report query parameters',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const data = await reportsService.getIncidentsReport(parsed.data);

    if (parsed.data.format === 'csv') {
      setCsvHeaders(res, `report_incidents_${Date.now()}.csv`);
      res.send(reportsService.toCsv('incidents', data));
      await auditService.recordAudit({
        actorUserId: req.user!.id,
        actorRole: 'ADMIN',
        action: 'EXPORT_GENERATED',
        entityType: 'REPORT_INCIDENTS',
        details: { format: 'csv', filters: parsed.data },
      });
      return;
    }

    res.status(200).json({ data });
    return;
  } catch (err) {
    next(err);
  }
});


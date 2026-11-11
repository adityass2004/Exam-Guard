import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { incidentsService } from './incidents.service.js';
import { incidentReportService } from './report.service.js';
import { sessionCancelService } from '../sessions/cancel.service.js';
import {
  acknowledgeIncidentSchema,
  addIncidentNoteSchema,
  incidentFilterSchema,
  reviewIncidentSchema,
} from '@examguard/shared';
import { AppError } from '../../lib/errors.js';

export const incidentsRouter = Router();

incidentsRouter.use(requireAuth, requireRole('ADMIN'));

// 1. List / filter incidents
incidentsRouter.get('/', async (req, res, next) => {
  try {
    const parsedQuery = incidentFilterSchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid filter parameters', parsedQuery.error.format());
    }

    const result = await incidentsService.listIncidents(parsedQuery.data);
    res.status(200).json({ data: result.items, meta: { nextCursor: result.nextCursor } });
  } catch (err) {
    next(err);
  }
});

// 2. Incident detail
incidentsRouter.get('/:id', async (req, res, next) => {
  try {
    const detail = await incidentsService.getIncidentDetail(req.params.id, req.user!.id);
    res.status(200).json({ data: detail });
  } catch (err) {
    next(err);
  }
});

// 3. Acknowledge incident
incidentsRouter.post('/:id/acknowledge', async (req, res, next) => {
  try {
    const parsed = acknowledgeIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid payload', parsed.error.format());
    }

    const result = await incidentsService.acknowledgeIncident(
      req.params.id,
      req.user!.id,
      parsed.data.note
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// 4. Review incident
incidentsRouter.post('/:id/review', async (req, res, next) => {
  try {
    const parsed = reviewIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid review payload', parsed.error.format());
    }

    const result = await incidentsService.reviewIncident(
      req.params.id,
      req.user!.id,
      parsed.data.disposition,
      parsed.data.note
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// 5. Add note to incident
incidentsRouter.post('/:id/notes', async (req, res, next) => {
  try {
    const parsed = addIncidentNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid note payload', parsed.error.format());
    }

    const result = await incidentsService.addNote(
      req.params.id,
      req.user!.id,
      parsed.data.note
    );
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// 6. Export incident report (CSV or HTML)
incidentsRouter.get('/:id/report', async (req, res, next) => {
  try {
    const format = req.query.format === 'html' ? 'html' : 'csv';
    const includeImages = req.query.includeImages === 'true';

    const report = await incidentReportService.generateReport(
      req.params.id,
      req.user!.id,
      format,
      includeImages
    );

    res.setHeader('Content-Type', report.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.setHeader('Cache-Control', 'no-store, private');
    res.send(report.content);
  } catch (err) {
    next(err);
  }
});

// 7. Manual session cancel route
export const sessionCancelRouter = Router();
sessionCancelRouter.use(requireAuth, requireRole('ADMIN'));

sessionCancelRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    const reason = req.body?.reason;
    if (!reason || typeof reason !== 'string') {
      throw new AppError('VALIDATION_ERROR', 400, 'Cancellation reason is required');
    }

    const result = await sessionCancelService.cancelSession(
      req.params.id,
      req.user!.id,
      reason
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

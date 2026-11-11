import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { verificationHistoryQuerySchema } from './history.schemas.js';
import { historyService } from './history.service.js';

export const historyRouter = Router();

historyRouter.use(requireAuth, requireRole('ADMIN'));

historyRouter.get('/', async (req, res, next) => {
  try {
    const parsed = verificationHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid verification history query parameters',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const result = await historyService.listVerifications(parsed.data);
    res.status(200).json({
      data: result.items,
      meta: {
        nextCursor: result.nextCursor,
      },
    });
    return;
  } catch (err) {
    next(err);
  }
});

historyRouter.get('/summary', async (req, res, next) => {
  try {
    const parsed = verificationHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid verification history query parameters',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const summary = await historyService.getSummary(parsed.data);
    res.status(200).json({
      data: summary,
    });
    return;
  } catch (err) {
    next(err);
  }
});

historyRouter.get('/export.csv', async (req, res, next) => {
  try {
    const parsed = verificationHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid export parameters',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    await historyService.streamExport(res, parsed.data, req.user!.id);
    return;
  } catch (err) {
    next(err);
  }
});


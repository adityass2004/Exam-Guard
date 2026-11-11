import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { retentionService } from './retention.service.js';

export const retentionRouter = Router();

retentionRouter.use(requireAuth, requireRole('ADMIN'));

const runRetentionSchema = z.object({
  dryRun: z.boolean().default(false),
});

retentionRouter.post('/run', async (req, res, next) => {
  try {
    const parsed = runRetentionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid retention trigger payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const result = await retentionService.runRetention(parsed.data, undefined, req.user!.id);
    res.status(200).json({ data: result });
    return;
  } catch (err) {
    next(err);
  }
});


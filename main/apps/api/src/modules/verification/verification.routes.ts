import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { clientEventSchema } from '@examguard/shared';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { AppError } from '../../lib/errors.js';
import { runVerificationCycle } from './verificationCycle.js';
import { clientEventsService } from './clientEvents.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

export const verificationRoutes = Router();

/**
 * POST /api/v1/student/sessions/:sessionId/verifications
 * Continuous biometric verification cycle called on regular timer tick (e.g. 1.5s).
 */
verificationRoutes.post(
  '/:sessionId/verifications',
  csrfProtection,
  upload.single('frame'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const studentUserId = req.user!.id;

      if (!req.file || !req.file.buffer) {
        throw new AppError('BAD_REQUEST', 400, 'Frame image file is required');
      }

      let clientCapturedAt: Date | undefined = undefined;
      if (req.body?.clientCapturedAt) {
        const parsed = new Date(req.body.clientCapturedAt);
        if (!isNaN(parsed.getTime())) {
          clientCapturedAt = parsed;
        }
      }

      const cycleResult = await runVerificationCycle({
        sessionId,
        studentUserId,
        phase: 'CONTINUOUS',
        imageBuffer: req.file.buffer,
        clientCapturedAt,
      });

      if (cycleResult.phase !== 'CONTINUOUS') {
        throw new AppError('INTERNAL_ERROR', 500, 'Invalid verification phase resolution');
      }

      return res.status(200).json({
        success: true,
        data: cycleResult.response,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/v1/student/sessions/:sessionId/client-events
 * Processed client event (e.g. camera hardware disconnected/error).
 */
verificationRoutes.post(
  '/:sessionId/client-events',
  csrfProtection,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const studentUserId = req.user!.id;

      const parsed = clientEventSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 400, 'Invalid client event payload');
      }

      const result = await clientEventsService.recordClientEvent(
        sessionId,
        studentUserId,
        parsed.data
      );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      return next(err);
    }
  }
);

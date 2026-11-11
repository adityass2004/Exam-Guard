import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AppError } from '../../lib/errors.js';
import { sandboxService } from './sandbox.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

export const sandboxRouter = Router();

// GET /api/v1/sandbox/faces - List all enrolled reference faces from separate SQLite DB
sandboxRouter.get('/faces', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const faces = sandboxService.getFaces();
    res.json({ data: faces });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/sandbox/enroll - Record a new reference face (1 frame or 5-shot centroid, unauthenticated)
sandboxRouter.post(
  '/enroll',
  upload.any(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
      if (files.length === 0) {
        throw new AppError('BAD_REQUEST', 400, 'Image frame is required for face enrollment');
      }

      const label = req.body?.label ? String(req.body.label) : undefined;
      const buffers = files.map((f) => f.buffer).filter(Boolean);

      if (buffers.length === 0) {
        throw new AppError('BAD_REQUEST', 400, 'Image frame is required for face enrollment');
      }

      const enrolled = buffers.length === 1
        ? await sandboxService.enrollFace(buffers[0], label)
        : await sandboxService.enrollMultiFaces(buffers, label);

      res.status(201).json({ data: enrolled });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/sandbox/detect - Run live detection & verification (unauthenticated)
sandboxRouter.post(
  '/detect',
  upload.any(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
      const file = files[0];
      if (!file || !file.buffer) {
        throw new AppError('BAD_REQUEST', 400, 'Image frame is required for face detection');
      }

      const faceId = req.body?.faceId ? String(req.body.faceId) : undefined;
      const thresholdPct = req.body?.thresholdPct ? Number(req.body.thresholdPct) : 75;

      const result = await sandboxService.detectAndVerify(
        file.buffer,
        faceId,
        thresholdPct
      );

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/sandbox/preview-check - Real-time enrollment guidance & quality check
sandboxRouter.post(
  '/preview-check',
  upload.any(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
      const file = files[0];
      if (!file || !file.buffer) {
        throw new AppError('BAD_REQUEST', 400, 'Image frame is required for preview check');
      }

      const angle = req.body?.angle ? String(req.body.angle) : undefined;
      const result = await sandboxService.checkQuality(file.buffer, angle);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/sandbox/scrfd-detect - Real-Time SCRFD Face Detection Visualization
sandboxRouter.post(
  '/scrfd-detect',
  upload.any(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
      const file = files[0];
      if (!file || !file.buffer) {
        throw new AppError('BAD_REQUEST', 400, 'Image frame is required for SCRFD face detection');
      }

      const frameId = req.body?.frameId ? String(req.body.frameId) : undefined;
      const result = await sandboxService.detectScrfd(file.buffer, frameId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/sandbox/logs - Get recent verification logs
sandboxRouter.get('/logs', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = sandboxService.getRecentLogs();
    res.json({ data: logs });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/sandbox/faces/:id - Delete an enrolled face
sandboxRouter.delete('/faces/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    sandboxService.deleteFace(req.params.id);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/sandbox/reset - Clear all sandbox data
sandboxRouter.post('/reset', (_req: Request, res: Response, next: NextFunction) => {
  try {
    sandboxService.resetAll();
    res.json({ data: { success: true, message: 'Sandbox database reset successfully' } });
  } catch (err) {
    next(err);
  }
});


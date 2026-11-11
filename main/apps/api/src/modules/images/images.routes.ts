import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { serveProtectedImage } from './secureImage.service.js';
import { evidenceImageRouter } from './evidence.routes.js';

export const imagesRouter = Router();

// Protect all image streaming endpoints
imagesRouter.use(requireAuth, requireRole('ADMIN'));

// Mount evidence image streamer under /evidence (full path: /api/v1/admin/images/evidence/:triggerId)
imagesRouter.use('/evidence', evidenceImageRouter);

// Generous session-based rate limit to blunt scraping
const imageStreamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: true, keyGeneratorIpFallback: false },
  keyGenerator: (req) => req.session?.id || req.ip || 'anonymous',
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many image requests. Please wait a moment.',
    },
  },
});

imagesRouter.use(imageStreamLimiter);

/**
 * GET /admin/images/enrollment/:imageId
 * Streams decrypted candidate enrollment JPEG.
 * Authenticated, verified with SHA-256 integrity, audited, Cache-Control: no-store.
 */
imagesRouter.get('/enrollment/:imageId', async (req, res, next) => {
  try {
    const { imageId } = req.params;
    const actorUserId = req.user!.id;
    const actorRole = req.user!.role;
    const requestId = (req as unknown as { id?: string }).id;
    const reqIp = req.ip || req.socket.remoteAddress;

    await serveProtectedImage({
      kind: 'ENROLLMENT',
      imageId,
      actorUserId,
      actorRole,
      requestId,
      reqIp,
      res,
    });
  } catch (err) {
    next(err);
  }
});

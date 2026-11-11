import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { healthRouter, systemRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { studentRouter } from './modules/student/index.js';
import { adminRouter } from './modules/admin/index.js';
import { sandboxRouter } from './modules/sandbox/sandbox.routes.js';

export function createApp(): Express {
  const app = express();

  // Security headers via helmet
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // Strict CORS policy
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'],
    }),
  );

  // Request ID correlation
  app.use(requestIdMiddleware);

  // Cookie parser for session and csrf cookies
  app.use(cookieParser());

  // JSON body parser with 1MB limit
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const requestId = (req as unknown as { id?: string }).id;
      logger.info(
        {
          requestId,
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          durationMs,
        },
        `${req.method} ${req.originalUrl} ${res.statusCode} - ${durationMs}ms`,
      );
    });
    next();
  });

  // Mount API v1 routes
  const v1 = express.Router();
  v1.use('/', healthRouter);
  v1.use('/system', systemRouter);
  v1.use('/auth', authRouter);
  v1.use('/student', studentRouter);
  v1.use('/admin', adminRouter);
  v1.use('/sandbox', sandboxRouter);

  app.use('/api/v1', v1);

  // 404 and global error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();


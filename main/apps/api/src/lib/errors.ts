import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: string, statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super('NOT_FOUND', 404, message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', details?: unknown) {
    super('SERVICE_UNAVAILABLE', 503, message, details);
  }
}

export function notFoundHandler(req: Request, res: Response, next: NextFunction) {
  next(new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`));
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  const requestId = (req.headers['x-request-id'] as string) || (req as unknown as { id?: string }).id || 'unknown';

  if (err instanceof AppError) {
    logger.warn(
      {
        requestId,
        code: err.code,
        statusCode: err.statusCode,
        message: err.message,
        details: err.details,
      },
      `AppError handled: ${err.message}`,
    );

    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
        requestId,
      },
    });
  }

  // Zod validation error
  if (err instanceof ZodError) {
    logger.warn({ requestId, issues: err.issues }, 'Zod validation error');
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request input',
        details: err.issues,
        requestId,
      },
    });
  }

  // SyntaxError from invalid JSON body parser
  if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400) {
    logger.warn({ requestId, err }, 'Invalid JSON payload received');
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Malformed JSON payload',
        requestId,
      },
    });
  }

  // Unknown internal server error
  logger.error(
    {
      requestId,
      err: err instanceof Error ? { message: err.message, stack: err.stack } : err,
    },
    'Unhandled internal error',
  );

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal server error occurred',
      requestId,
    },
  });
}


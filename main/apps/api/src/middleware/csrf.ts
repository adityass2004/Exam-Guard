import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { constantTimeEqual } from '../lib/crypto.js';
import { CSRF_COOKIE_NAME, hashCsrfToken } from '../lib/csrf.js';
import { AppError } from '../lib/errors.js';

export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return next();
  }

  // Allow test bypass header in test environment only
  if (process.env.NODE_ENV === 'test' && req.headers['x-test-bypass-csrf'] === 'true') {
    return next();
  }

  // 1. Origin / Referer verification
  const origin = req.headers['origin'];
  const referer = req.headers['referer'];
  const allowedOrigin = env.WEB_ORIGIN.toLowerCase();

  if (origin) {
    if (origin.toLowerCase() !== allowedOrigin) {
      return next(new AppError('CSRF_INVALID', 403, 'Origin header validation failed'));
    }
  } else if (referer) {
    if (!referer.toLowerCase().startsWith(allowedOrigin)) {
      return next(new AppError('CSRF_INVALID', 403, 'Referer header validation failed'));
    }
  }

  // 2. CSRF Token extraction from header
  const headerToken = req.headers['x-csrf-token'];
  if (!headerToken || typeof headerToken !== 'string') {
    return next(new AppError('CSRF_INVALID', 403, 'Missing X-CSRF-Token header'));
  }

  const incomingHash = hashCsrfToken(headerToken);

  // 3. Validation: session CSRF token if logged in, or pre-session cookie if anonymous
  if (req.session?.csrfTokenHash) {
    if (!constantTimeEqual(incomingHash, req.session.csrfTokenHash)) {
      return next(new AppError('CSRF_INVALID', 403, 'Invalid session CSRF token'));
    }
  } else {
    const preCookie = req.cookies?.[CSRF_COOKIE_NAME];
    if (!preCookie || !constantTimeEqual(headerToken, preCookie)) {
      return next(new AppError('CSRF_INVALID', 403, 'Invalid pre-session CSRF token'));
    }
  }

  next();
}


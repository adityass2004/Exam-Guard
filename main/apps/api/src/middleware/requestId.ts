import type { NextFunction, Request, Response } from 'express';
import { generateUuid } from '../lib/ids.js';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim().length > 0
    ? incomingId.trim()
    : generateUuid();

  (req as unknown as { id: string }).id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}


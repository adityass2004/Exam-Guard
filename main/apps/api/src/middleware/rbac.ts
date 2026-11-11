import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { AppError } from '../lib/errors.js';

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('UNAUTHENTICATED', 401, 'Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          'FORBIDDEN',
          403,
          `Access forbidden: requires ${allowedRoles.join(' or ')} role`,
        ),
      );
    }

    next();
  };
}

export function requireOwnership(getOwnerId: (req: Request) => string | undefined | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('UNAUTHENTICATED', 401, 'Authentication required'));
    }

    // Admins bypass ownership checks
    if (req.user.role === 'ADMIN') {
      return next();
    }

    const ownerId = getOwnerId(req);
    if (!ownerId || ownerId !== req.user.id) {
      return next(new AppError('FORBIDDEN', 403, 'Forbidden: you do not own this resource'));
    }

    next();
  };
}


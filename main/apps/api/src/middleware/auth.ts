import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { SESSION_COOKIE_NAME, sessionService, type SessionWithUser } from '../modules/auth/session.service.js';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  fullName: string;
  email: string;
  studentId?: string;
  enrollmentStatus?: string | null;
  mustChangePassword?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      session?: SessionWithUser;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (!rawToken) {
      throw new AppError('UNAUTHENTICATED', 401, 'Authentication required');
    }

    const session = await sessionService.getValidSession(rawToken);
    if (!session) {
      throw new AppError('UNAUTHENTICATED', 401, 'Invalid or expired session');
    }

    req.session = session;
    req.user = {
      id: session.user.id,
      role: session.user.role,
      fullName: session.user.fullName,
      email: session.user.email,
      studentId: session.user.studentProfile?.studentId,
      enrollmentStatus: session.user.studentProfile?.enrollmentStatusCache,
      mustChangePassword: session.user.mustChangePassword,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken) {
      const session = await sessionService.getValidSession(rawToken);
      if (session) {
        req.session = session;
        req.user = {
          id: session.user.id,
          role: session.user.role,
          fullName: session.user.fullName,
          email: session.user.email,
          studentId: session.user.studentProfile?.studentId,
          enrollmentStatus: session.user.studentProfile?.enrollmentStatusCache,
          mustChangePassword: session.user.mustChangePassword,
        };
      }
    }
    next();
  } catch {
    next();
  }
}


import { Router } from 'express';
import { UserRole } from '@prisma/client';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
} from '@examguard/shared';
import { generateCsrfToken, hashCsrfToken, setCsrfCookie } from '../../lib/csrf.js';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { authRateLimiter } from '../../middleware/rateLimit.js';
import { authService } from './auth.service.js';
import { SESSION_COOKIE_NAME, sessionService } from './session.service.js';

export const authRouter = Router();

// Rate limiter for all /auth endpoints
authRouter.use(authRateLimiter);

// 1. GET /auth/csrf - Get CSRF token and set pre-session cookie if needed
authRouter.get('/csrf', (req, res) => {
  const token = generateCsrfToken();
  setCsrfCookie(res, token);
  res.status(200).json({ data: { csrfToken: token } });
});

// Load session if cookie is present so csrfProtection can validate session csrfTokenHash
authRouter.use(optionalAuth);

// CSRF protection applies to state-changing endpoints
authRouter.use(csrfProtection);

// 2. POST /auth/register - Student registration
authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const requestId = (req as unknown as { id?: string }).id;
    const ip = req.ip || req.socket.remoteAddress;

    const data = await authService.registerStudent(input, requestId, ip);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// 3. POST /auth/login - Student login
authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const requestId = (req as unknown as { id?: string }).id;
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Determine CSRF token for the new session
    const headerToken = req.headers['x-csrf-token'] as string;
    const sessionCsrfToken = headerToken || generateCsrfToken();
    const csrfTokenHash = hashCsrfToken(sessionCsrfToken);

    const { authData, rawToken } = await authService.login(
      input,
      UserRole.STUDENT,
      csrfTokenHash,
      userAgent,
      requestId,
      ip,
    );

    sessionService.setSessionCookie(res, rawToken);
    setCsrfCookie(res, sessionCsrfToken);

    res.status(200).json({ data: authData });
  } catch (err) {
    next(err);
  }
});

// 4. POST /auth/admin/login - Admin login
authRouter.post('/admin/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const requestId = (req as unknown as { id?: string }).id;
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const headerToken = req.headers['x-csrf-token'] as string;
    const sessionCsrfToken = headerToken || generateCsrfToken();
    const csrfTokenHash = hashCsrfToken(sessionCsrfToken);

    const { authData, rawToken } = await authService.login(
      input,
      UserRole.ADMIN,
      csrfTokenHash,
      userAgent,
      requestId,
      ip,
    );

    sessionService.setSessionCookie(res, rawToken);
    setCsrfCookie(res, sessionCsrfToken);

    res.status(200).json({ data: authData });
  } catch (err) {
    next(err);
  }
});

// 5. POST /auth/logout - Revoke session
authRouter.post('/logout', async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken) {
      await sessionService.revokeSession(rawToken);
    }
    sessionService.clearSessionCookie(res);
    res.status(200).json({ data: { message: 'Logged out successfully' } });
  } catch (err) {
    next(err);
  }
});

// 6. GET /auth/me - Current user identity
authRouter.get('/me', requireAuth, (req, res) => {
  res.status(200).json({ data: req.user });
});

// 7. POST /auth/change-password - Change current user's password
authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const input = changePasswordSchema.parse(req.body);
    const requestId = (req as unknown as { id?: string }).id;
    const ip = req.ip || req.socket.remoteAddress;

    await authService.changePassword(
      req.user!.id,
      req.session!.id,
      input,
      requestId,
      ip,
    );

    res.status(200).json({ data: { message: 'Password changed successfully' } });
  } catch (err) {
    next(err);
  }
});

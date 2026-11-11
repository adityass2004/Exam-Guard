import crypto from 'node:crypto';
import type { Response } from 'express';
import { env } from '../config/env.js';

export const CSRF_COOKIE_NAME = 'eg_csrf';

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashCsrfToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function setCsrfCookie(res: Response, token: string): void {
  const isProd = env.NODE_ENV === 'production';
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Accessible by JavaScript so client can send in X-CSRF-Token header
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });
}


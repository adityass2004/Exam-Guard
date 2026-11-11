import http from 'node:http';
import { env } from '../config/env.js';
import { SESSION_COOKIE_NAME, sessionService, SessionWithUser } from '../modules/auth/session.service.js';

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('=').trim());
    }
  });

  return list;
}

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return false;

  // Exact match against configured WEB_ORIGIN
  if (origin === env.WEB_ORIGIN) return true;

  // Tolerate localhost variations (e.g. 127.0.0.1 vs localhost) in local development
  try {
    const originUrl = new URL(origin);
    const webOriginUrl = new URL(env.WEB_ORIGIN);

    const isLocalhost =
      (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') &&
      (webOriginUrl.hostname === 'localhost' || webOriginUrl.hostname === '127.0.0.1');

    return isLocalhost && originUrl.port === webOriginUrl.port;
  } catch {
    return false;
  }
}

export interface WsAuthResult {
  session: SessionWithUser;
  userId: string;
}

/**
 * Validates WebSocket upgrade request:
 * 1. Checks Origin header against allowed web origin
 * 2. Parses eg_session cookie and verifies active session in database
 * 3. Enforces that the user has ADMIN role and ACTIVE status
 */
export async function authenticateWsUpgrade(
  req: http.IncomingMessage
): Promise<WsAuthResult> {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    throw new Error('FORBIDDEN_ORIGIN');
  }

  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken) {
    throw new Error('UNAUTHENTICATED');
  }

  const session = await sessionService.getValidSession(rawToken);
  if (!session || session.user.status !== 'ACTIVE') {
    throw new Error('UNAUTHENTICATED');
  }

  if (session.user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN_ROLE');
  }

  return {
    session,
    userId: session.user.id,
  };
}

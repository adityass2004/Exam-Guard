import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

declare global {
  // eslint-disable-next-line no-var
  var __examguard_prisma: PrismaClient | undefined;
}

export function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'info' },
      { emit: 'event', level: 'warn' },
    ],
  });

  if (process.env.NODE_ENV === 'development') {
    // Optional query logging in debug
    // client.$on('query', (e) => logger.trace(e, 'Prisma Query'));
  }

  client.$on('error', (e) => {
    logger.error({ err: e }, 'Prisma error event');
  });

  return client;
}

export const prisma = globalThis.__examguard_prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__examguard_prisma = prisma;
}

export async function checkDatabaseConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ error: message }, 'Database connectivity check failed');
    return { ok: false, error: message };
  }
}


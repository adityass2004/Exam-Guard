import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { sessionExpiryJob } from './jobs/expiry.js';
import { sessionWatchdogJob } from './jobs/watchdog.js';
import { startRetentionJob, stopRetentionJob } from './jobs/retention.js';
import { createWebSocketServer } from './ws/server.js';
import { visionHealthPoller } from './ws/health-poller.js';

function initializeStorage(): string {
  const rootPath = path.resolve(process.cwd(), env.STORAGE_ROOT);
  const subdirs = ['enrollment', 'evidence', 'tmp'];

  for (const dir of subdirs) {
    const fullPath = path.join(rootPath, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  // Clean tmp directory on startup
  const tmpPath = path.join(rootPath, 'tmp');
  try {
    const files = fs.readdirSync(tmpPath);
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(tmpPath, file));
      } catch {
        // ignore individual file deletion errors
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Could not clean temporary storage directory');
  }

  return rootPath;
}

export function startServer() {
  const storageResolved = initializeStorage();
  logger.info({ storageRoot: storageResolved }, `Storage initialized at: ${storageResolved}`);

  const port = env.API_PORT;
  const server = http.createServer(app);
  const wss = createWebSocketServer(server);

  server.listen(port, () => {
    logger.info(`ExamGuard API server running on port ${port} (env: ${env.NODE_ENV})`);
    sessionExpiryJob.start();
    sessionWatchdogJob.start();
    visionHealthPoller.start();
    startRetentionJob();
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, initiating graceful shutdown...`);
    sessionExpiryJob.stop();
    sessionWatchdogJob.stop();
    visionHealthPoller.stop();
    stopRetentionJob();
    wss.close();
    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await prisma.$disconnect();
        logger.info('Prisma disconnected');
      } catch (err) {
        logger.error({ err }, 'Error during Prisma disconnect');
      }
      process.exit(0);
    });

    // Force close if graceful fails after 10s
    setTimeout(() => {
      logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}


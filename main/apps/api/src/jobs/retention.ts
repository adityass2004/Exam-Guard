import { retentionService } from '../modules/retention/retention.service.js';
import { logger } from '../lib/logger.js';

let retentionInterval: NodeJS.Timeout | null = null;

/**
 * Retention background job.
 * Runs daily (every 24 hours) or at a configured interval.
 */
export function startRetentionJob(intervalMs = 24 * 60 * 60 * 1000): void {
  if (retentionInterval) {
    return;
  }

  logger.info({ intervalMs }, 'Starting retention background job');

  retentionInterval = setInterval(async () => {
    try {
      logger.info('Executing scheduled data retention purge...');
      const result = await retentionService.runRetention({ dryRun: false });
      logger.info(result, 'Scheduled retention purge completed');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Scheduled retention purge failed');
    }
  }, intervalMs);
}

export function stopRetentionJob(): void {
  if (retentionInterval) {
    clearInterval(retentionInterval);
    retentionInterval = null;
    logger.info('Retention background job stopped');
  }
}


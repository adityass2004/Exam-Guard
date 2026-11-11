import type {
  HealthReadyResponseData,
  HealthResponseData,
  SystemStatusResponseData,
} from '@examguard/shared';
import { env } from '../../config/env.js';
import { checkDatabaseConnection } from '../../lib/prisma.js';
import {
  defaultVisionClient,
  type IVisionClient,
  type VisionDiagnosticsResponse,
} from '../../lib/vision-client.js';

export class HealthService {
  constructor(private visionClient: IVisionClient = defaultVisionClient) {}

  getLiveness(): HealthResponseData {
    return {
      status: 'ok',
      uptimeSec: Math.floor(process.uptime()),
      version: '0.1.0',
    };
  }

  async getReadiness(): Promise<{
    httpStatus: number;
    data: HealthReadyResponseData;
  }> {
    const dbCheck = await checkDatabaseConnection();
    const databaseStatus = dbCheck.ok ? 'UP' : 'DOWN';

    let visionStatus: 'UP' | 'DEGRADED' | 'DOWN' = 'DOWN';
    let visionModelLoaded = false;
    let visionError: string | null = null;

    try {
      const vHealth = await this.visionClient.health();
      visionModelLoaded = vHealth.modelLoaded;
      if (vHealth.status === 'OK' && vHealth.modelLoaded) {
        visionStatus = 'UP';
      } else {
        visionStatus = 'DEGRADED';
      }
    } catch (err: unknown) {
      visionStatus = 'DOWN';
      visionError = err instanceof Error ? err.message : String(err);
    }

    const httpStatus = databaseStatus === 'DOWN' ? 503 : 200;

    return {
      httpStatus,
      data: {
        api: 'UP',
        database: databaseStatus,
        vision: visionStatus,
        details: {
          databaseError: dbCheck.error ?? null,
          visionError,
          visionModelLoaded,
        },
      },
    };
  }

  async getSystemStatus(): Promise<{
    httpStatus: number;
    data: SystemStatusResponseData;
  }> {
    const readiness = await this.getReadiness();
    let calibrationStatus: 'PROVISIONAL' | 'CALIBRATED' | 'UNKNOWN' = 'UNKNOWN';
    let visionDetails: SystemStatusResponseData['visionDetails'] = null;

    if (readiness.data.vision !== 'DOWN') {
      try {
        const diag: VisionDiagnosticsResponse = await this.visionClient.diagnostics();
        calibrationStatus = diag.calibrationStatus;
        visionDetails = {
          versions: diag.versions,
          executionProviders: diag.executionProviders,
          modelState: diag.modelState,
          concurrency: diag.concurrency,
        };
      } catch {
        calibrationStatus = 'UNKNOWN';
      }
    }

    return {
      httpStatus: readiness.httpStatus,
      data: {
        ...readiness.data,
        version: '0.1.0',
        nodeEnv: env.NODE_ENV,
        calibrationStatus,
        visionDetails,
        serverTime: new Date().toISOString(),
      },
    };
  }
}

export const healthService = new HealthService();


import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { verificationEventBus } from '../modules/verification/eventBus.js';
import { WsServiceHealthPayload } from '@examguard/shared';

export class VisionHealthPoller {
  private timer: NodeJS.Timeout | null = null;
  private lastStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN' | null = null;

  constructor(
    private pollIntervalMs: number = 10000,
    private visionUrl: string = env.VISION_URL || 'http://127.0.0.1:8000'
  ) {}

  start(): void {
    if (this.timer) return;
    this.poll(); // Initial check
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll(): Promise<WsServiceHealthPayload | null> {
    const start = Date.now();
    let currentStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'DOWN';
    let modelLoaded = false;
    let latencyMs = 0;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${this.visionUrl}/v1/health`, {
        signal: controller.signal,
        headers: {
          'X-Internal-Key': env.VISION_INTERNAL_KEY,
        },
      });
      clearTimeout(timeout);
      latencyMs = Date.now() - start;

      if (res.ok) {
        const body = (await res.json()) as any;
        modelLoaded = Boolean(body?.model_loaded ?? body?.data?.modelLoaded ?? true);
        currentStatus = modelLoaded ? 'HEALTHY' : 'DEGRADED';
      } else {
        currentStatus = 'DOWN';
      }
    } catch {
      currentStatus = 'DOWN';
      latencyMs = Date.now() - start;
    }

    const payload: WsServiceHealthPayload = {
      service: 'vision',
      status: currentStatus,
      modelLoaded,
      latencyMs,
      timestamp: new Date().toISOString(),
    };

    // Emit strictly on status change or first poll
    if (this.lastStatus !== currentStatus) {
      logger.info(
        { from: this.lastStatus, to: currentStatus, latencyMs },
        'Vision service health status changed'
      );
      this.lastStatus = currentStatus;
      verificationEventBus.emit('service.health', payload);
    }

    return payload;
  }
}

export const visionHealthPoller = new VisionHealthPoller();

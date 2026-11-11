import { PreVerificationResult } from '@examguard/shared';
import { defaultVisionClient, IVisionClient } from '../../lib/vision-client.js';
import { referenceService, ReferenceService } from '../../lib/reference.service.js';
import { runVerificationCycle } from '../verification/verificationCycle.js';

export class PreverifyService {
  private visionClient: IVisionClient;
  private refService: ReferenceService;

  constructor(options?: { visionClient?: IVisionClient; referenceService?: ReferenceService }) {
    this.visionClient = options?.visionClient ?? defaultVisionClient;
    this.refService = options?.referenceService ?? referenceService;
  }

  async runPreVerification(
    sessionId: string,
    studentUserId: string,
    imageBuffer: Buffer
  ): Promise<PreVerificationResult> {
    const cycleResult = await runVerificationCycle({
      sessionId,
      studentUserId,
      phase: 'PRE_EXAM',
      imageBuffer,
      visionClient: this.visionClient,
      referenceService: this.refService,
    });

    if (cycleResult.phase !== 'PRE_EXAM') {
      throw new Error('Unexpected phase result returned for pre-verification');
    }

    return cycleResult.response;
  }
}

export const preverifyService = new PreverifyService();

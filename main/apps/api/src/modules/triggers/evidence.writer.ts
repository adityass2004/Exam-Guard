import { EvidenceCaptureStatus } from '@examguard/shared';
import { logger } from '../../lib/logger.js';
import {
  deleteStoredFile,
  storeEncryptedImage,
  StoredImageRecord,
} from '../../lib/storage.js';

export type { StoredImageRecord };

export interface EvidenceWriteResult {
  status: EvidenceCaptureStatus;
  record?: StoredImageRecord;
  failureReason?: string;
}

export class EvidenceWriter {
  /**
   * Writes an encrypted evidence image to disk if a valid frame buffer is provided
   * and the trigger action requires evidence capture.
   * Never throws: on failure, returns { status: 'FAILED', failureReason: string }.
   */
  async writeEvidence(
    frameBuffer?: Buffer | null
  ): Promise<EvidenceWriteResult> {
    if (!frameBuffer || frameBuffer.length === 0) {
      return {
        status: 'NOT_AVAILABLE',
      };
    }

    try {
      const record = await storeEncryptedImage({
        kind: 'evidence',
        bytes: frameBuffer,
      });

      return {
        status: 'CAPTURED',
        record,
      };
    } catch (err: any) {
      const failureReason =
        err?.message || 'Failed to encrypt and store evidence frame';

      logger.warn(
        { err: failureReason },
        'Evidence frame capture failed; incident will open with status FAILED'
      );

      return {
        status: 'FAILED',
        failureReason: failureReason.slice(0, 255),
      };
    }
  }

  /**
   * Unlinks the stored evidence file if the database transaction aborts or
   * if a concurrent duplicate open occurs. Idempotent and safe.
   */
  async rollbackEvidence(record?: StoredImageRecord | null): Promise<void> {
    if (!record?.relativePath) return;

    try {
      await deleteStoredFile(record.relativePath);
    } catch (err: any) {
      logger.error(
        { err: err.message, relativePath: record.relativePath },
        'Failed to rollback evidence file during transaction abort'
      );
    }
  }
}

export const evidenceWriter = new EvidenceWriter();

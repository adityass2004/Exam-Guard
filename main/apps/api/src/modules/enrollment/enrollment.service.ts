import {
  type FaceAngle,
  type EnrollmentStatus,
  BIOMETRIC_CONSENT_POLICY_VERSION,
  BIOMETRIC_CONSENT_SHA256,
  type EnrollmentStatusResponse,
  type PreviewCheckResponse,
  type EnrollmentCaptureResponse,
  type EnrollmentFinalizeResponse,
} from '@examguard/shared';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { auditService } from '../audit/audit.service.js';
import { defaultVisionClient, type IVisionClient } from '../../lib/vision-client.js';
import {
  storeEncryptedImage,
  deleteStoredFile,
} from '../../lib/storage.js';
import {
  decryptAesGcm,
  encryptAesGcm,
} from '../../lib/crypto.js';
import { validateEnrollmentCaptureQuality } from './acceptance.js';
import {
  base64ToFloat32Array,
  bufferToFloat32Array,
  computeCentroid,
  float32ArrayToBuffer,
} from './centroid.js';
import { enrollmentConfig } from '../../config/enrollment.js';

const REQUIRED_ANGLES: FaceAngle[] = ['FRONT', 'LEFT', 'RIGHT', 'UP', 'DOWN'];

export class EnrollmentService {
  constructor(private visionClient: IVisionClient = defaultVisionClient) {}

  async recordConsent(
    studentUserId: string,
    accepted: boolean,
    policyVersion: string,
    reqIp?: string,
    requestId?: string,
  ) {
    if (!accepted) {
      throw new AppError('VALIDATION_ERROR', 400, 'Consent acceptance must be explicitly true');
    }

    const consent = await prisma.consentRecord.create({
      data: {
        userId: studentUserId,
        consentType: 'BIOMETRIC_IDENTITY_VERIFICATION',
        policyVersion: policyVersion || BIOMETRIC_CONSENT_POLICY_VERSION,
        policyTextSha256: BIOMETRIC_CONSENT_SHA256,
        granted: true,
      },
    });

    await auditService.log({
      actorUserId: studentUserId,
      actorRole: 'STUDENT',
      action: 'BIOMETRIC_CONSENT_RECORDED',
      entityType: 'CONSENT_RECORD',
      entityId: consent.id,
      after: { policyVersion, granted: true },
      reqIp,
      requestId,
    });

    return {
      granted: true,
      policyVersion: consent.policyVersion,
      createdAt: consent.createdAt.toISOString(),
    };
  }

  async getEnrollmentStatus(studentUserId: string): Promise<EnrollmentStatusResponse> {
    const latestConsent = await prisma.consentRecord.findFirst({
      where: {
        userId: studentUserId,
        consentType: 'BIOMETRIC_IDENTITY_VERIFICATION',
        granted: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const hasConsent = !!latestConsent;

    const previousApproved = await prisma.faceProfile.findFirst({
      where: {
        studentUserId,
        status: 'APPROVED',
      },
    });

    // Find active draft or pending approval, or fallback to latest profile
    const activeProfile = await prisma.faceProfile.findFirst({
      where: {
        studentUserId,
        status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'] },
      },
      orderBy: { version: 'desc' },
      include: {
        images: true,
      },
    });

    if (!activeProfile) {
      return {
        hasConsent,
        profile: null,
        previousApprovedProfileExists: !!previousApproved,
      };
    }

    const imagesByAngle = new Map(activeProfile.images.map((img) => [img.angle, img]));

    const anglesObj: Record<FaceAngle, { captured: boolean; capturedAt?: string; qualitySummary?: any }> = {
      FRONT: { captured: false },
      LEFT: { captured: false },
      RIGHT: { captured: false },
      UP: { captured: false },
      DOWN: { captured: false },
    };

    let progressCount = 0;
    for (const angle of REQUIRED_ANGLES) {
      const img = imagesByAngle.get(angle);
      if (img) {
        progressCount++;
        anglesObj[angle] = {
          captured: true,
          capturedAt: img.capturedAt.toISOString(),
          qualitySummary: img.quality as any,
        };
      }
    }

    return {
      hasConsent,
      previousApprovedProfileExists: !!previousApproved,
      profile: {
        id: activeProfile.id,
        version: activeProfile.version,
        status: activeProfile.status as EnrollmentStatus,
        progress: progressCount,
        angles: anglesObj,
        submittedAt: activeProfile.submittedAt?.toISOString(),
        approvedAt: activeProfile.approvedAt?.toISOString(),
        rejectedReason: activeProfile.rejectedReason || undefined,
      },
    };
  }

  async startEnrollment(studentUserId: string, reqIp?: string, requestId?: string) {
    const latestConsent = await prisma.consentRecord.findFirst({
      where: {
        userId: studentUserId,
        consentType: 'BIOMETRIC_IDENTITY_VERIFICATION',
        granted: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestConsent) {
      throw new AppError('CONSENT_REQUIRED', 403, 'Biometric verification consent must be accepted before enrollment');
    }

    // Check for existing DRAFT profile
    const existingDraft = await prisma.faceProfile.findFirst({
      where: {
        studentUserId,
        status: 'DRAFT',
      },
      include: { images: true },
    });

    if (existingDraft) {
      return this.getEnrollmentStatus(studentUserId);
    }

    // Get max version for this student
    const maxVerProfile = await prisma.faceProfile.findFirst({
      where: { studentUserId },
      orderBy: { version: 'desc' },
    });

    const newVersion = (maxVerProfile?.version || 0) + 1;

    const newProfile = await prisma.faceProfile.create({
      data: {
        studentUserId,
        version: newVersion,
        status: 'DRAFT',
        modelName: 'buffalo_l',
        modelVersion: '1.0',
        embeddingDim: 512,
      },
    });

    await prisma.studentProfile.updateMany({
      where: { userId: studentUserId },
      data: { enrollmentStatusCache: 'DRAFT' },
    });

    await auditService.log({
      actorUserId: studentUserId,
      actorRole: 'STUDENT',
      action: 'ENROLLMENT_STARTED',
      entityType: 'FACE_PROFILE',
      entityId: newProfile.id,
      after: { version: newVersion, status: 'DRAFT' },
      reqIp,
      requestId,
    });

    return this.getEnrollmentStatus(studentUserId);
  }

  async previewCheck(frameBuffer: Buffer, targetAngle: FaceAngle): Promise<PreviewCheckResponse> {
    const qualityRes = await this.visionClient.quality(frameBuffer, targetAngle);
    const acceptance = validateEnrollmentCaptureQuality(qualityRes, targetAngle);

    return {
      acceptable: acceptance.acceptable,
      reasons: acceptance.reasons,
      hints: acceptance.hints,
      quality: qualityRes.quality,
      faceCount: qualityRes.faceCount,
    };
  }

  async captureAngle(
    studentUserId: string,
    targetAngle: FaceAngle,
    frameBuffer: Buffer,
    reqIp?: string,
    requestId?: string,
  ): Promise<EnrollmentCaptureResponse> {
    // 1. Verify consent & active draft profile
    const draftProfile = await prisma.faceProfile.findFirst({
      where: {
        studentUserId,
        status: 'DRAFT',
      },
    });

    if (!draftProfile) {
      throw new AppError('NO_DRAFT_ENROLLMENT', 400, 'No active draft enrollment found. Start enrollment first.');
    }

    // 2. Server-side quality check
    const qualityRes = await this.visionClient.quality(frameBuffer, targetAngle);
    const acceptance = validateEnrollmentCaptureQuality(qualityRes, targetAngle);

    if (!acceptance.acceptable) {
      throw new AppError('QUALITY_FAILED', 400, 'Capture failed quality or pose validation', {
        reasons: acceptance.reasons,
        hints: acceptance.hints,
        quality: qualityRes.quality,
      });
    }

    // 3. Generate embedding via vision service
    const embedRes = await this.visionClient.embed(frameBuffer, targetAngle);
    if (!embedRes.embedding) {
      throw new AppError('QUALITY_FAILED', 400, 'Could not generate face embedding for capture', {
        reasons: embedRes.reasons,
      });
    }

    // 4. Store encrypted image in local storage
    const storedImage = await storeEncryptedImage({
      kind: 'enrollment',
      bytes: frameBuffer,
    });

    // 5. Encrypt embedding with AES-256-GCM using EMBEDDING_ENCRYPTION_KEY
    const embeddingFloats = base64ToFloat32Array(embedRes.embedding);
    const embeddingBytes = float32ArrayToBuffer(embeddingFloats);
    const encEmbedding = encryptAesGcm(embeddingBytes, 'EMBEDDING');

    let oldStoragePath: string | null = null;

    try {
      // 6. Prisma transaction: upsert image and sample embedding
      await prisma.$transaction(async (tx) => {
        // Find existing image for this angle to replace
        const existingImg = await tx.faceEnrollmentImage.findUnique({
          where: {
            faceProfileId_angle: {
              faceProfileId: draftProfile.id,
              angle: targetAngle,
            },
          },
        });

        if (existingImg) {
          oldStoragePath = existingImg.storagePath;
        }

        await tx.faceEnrollmentImage.upsert({
          where: {
            faceProfileId_angle: {
              faceProfileId: draftProfile.id,
              angle: targetAngle,
            },
          },
          create: {
            faceProfileId: draftProfile.id,
            angle: targetAngle,
            storagePath: storedImage.relativePath,
            sha256: storedImage.sha256,
            mime: storedImage.mime,
            byteSize: storedImage.byteSize,
            width: storedImage.width,
            height: storedImage.height,
            encIv: new Uint8Array(storedImage.iv),
            encTag: new Uint8Array(storedImage.tag),
            encKeyVersion: storedImage.keyVersion,
            quality: qualityRes.quality as any,
            capturedAt: new Date(),
          },
          update: {
            storagePath: storedImage.relativePath,
            sha256: storedImage.sha256,
            mime: storedImage.mime,
            byteSize: storedImage.byteSize,
            width: storedImage.width,
            height: storedImage.height,
            encIv: new Uint8Array(storedImage.iv),
            encTag: new Uint8Array(storedImage.tag),
            encKeyVersion: storedImage.keyVersion,
            quality: qualityRes.quality as any,
            capturedAt: new Date(),
          },
        });

        await tx.faceEmbedding.upsert({
          where: {
            faceProfileId_kind_angle: {
              faceProfileId: draftProfile.id,
              kind: 'SAMPLE',
              angle: targetAngle,
            },
          },
          create: {
            faceProfileId: draftProfile.id,
            kind: 'SAMPLE',
            angle: targetAngle,
            ciphertext: new Uint8Array(encEmbedding.ciphertext),
            encIv: new Uint8Array(encEmbedding.iv),
            encTag: new Uint8Array(encEmbedding.tag),
            encKeyVersion: encEmbedding.keyVersion,
            dim: 512,
            modelName: embedRes.modelName || 'buffalo_l',
            modelVersion: embedRes.modelVersion || '1.0',
          },
          update: {
            ciphertext: new Uint8Array(encEmbedding.ciphertext),
            encIv: new Uint8Array(encEmbedding.iv),
            encTag: new Uint8Array(encEmbedding.tag),
            encKeyVersion: encEmbedding.keyVersion,
            dim: 512,
            modelName: embedRes.modelName || 'buffalo_l',
            modelVersion: embedRes.modelVersion || '1.0',
          },
        });
      });

      // If replacing previous capture, delete old file
      if (oldStoragePath) {
        await deleteStoredFile(oldStoragePath);
      }
    } catch (err: unknown) {
      // Clean up newly written file if transaction failed
      await deleteStoredFile(storedImage.relativePath);
      throw err;
    }

    const currentCount = await prisma.faceEnrollmentImage.count({
      where: { faceProfileId: draftProfile.id },
    });

    await auditService.log({
      actorUserId: studentUserId,
      actorRole: 'STUDENT',
      action: 'ENROLLMENT_CAPTURE',
      entityType: 'FACE_ENROLLMENT_IMAGE',
      entityId: `${draftProfile.id}:${targetAngle}`,
      after: { angle: targetAngle, progress: currentCount },
      reqIp,
      requestId,
    });

    return {
      angle: targetAngle,
      captured: true,
      progress: currentCount,
      quality: qualityRes.quality,
    };
  }

  async retakeAngle(studentUserId: string, angle: FaceAngle, reqIp?: string, requestId?: string) {
    const draftProfile = await prisma.faceProfile.findFirst({
      where: {
        studentUserId,
        status: 'DRAFT',
      },
    });

    if (!draftProfile) {
      throw new AppError('NO_DRAFT_ENROLLMENT', 400, 'No active draft enrollment found');
    }

    const img = await prisma.faceEnrollmentImage.findUnique({
      where: {
        faceProfileId_angle: {
          faceProfileId: draftProfile.id,
          angle,
        },
      },
    });

    if (!img) {
      return { success: true, angle };
    }

    await prisma.$transaction(async (tx) => {
      await tx.faceEnrollmentImage.deleteMany({
        where: {
          faceProfileId: draftProfile.id,
          angle,
        },
      });

      await tx.faceEmbedding.deleteMany({
        where: {
          faceProfileId: draftProfile.id,
          kind: 'SAMPLE',
          angle,
        },
      });
    });

    await deleteStoredFile(img.storagePath);

    await auditService.log({
      actorUserId: studentUserId,
      actorRole: 'STUDENT',
      action: 'ENROLLMENT_RETAKE',
      entityType: 'FACE_PROFILE',
      entityId: draftProfile.id,
      after: { removedAngle: angle },
      reqIp,
      requestId,
    });

    return { success: true, angle };
  }

  async finalizeEnrollment(
    studentUserId: string,
    reqIp?: string,
    requestId?: string,
  ): Promise<EnrollmentFinalizeResponse> {
    const draftProfile = await prisma.faceProfile.findFirst({
      where: {
        studentUserId,
        status: 'DRAFT',
      },
      include: {
        images: true,
        embeddings: {
          where: { kind: 'SAMPLE' },
        },
      },
    });

    if (!draftProfile) {
      throw new AppError('NO_DRAFT_ENROLLMENT', 400, 'No active draft enrollment found');
    }

    if (draftProfile.images.length < 5 || draftProfile.embeddings.length < 5) {
      throw new AppError('ENROLLMENT_INCOMPLETE', 400, 'All 5 angles must be captured before finalization', {
        capturedCount: draftProfile.images.length,
      });
    }

    // Decrypt all 5 sample embeddings
    const samples: Float32Array[] = [];
    const sampleAngles: FaceAngle[] = [];

    for (const embRecord of draftProfile.embeddings) {
      const decryptedBytes = decryptAesGcm(
        Buffer.from(embRecord.ciphertext),
        Buffer.from(embRecord.encIv),
        Buffer.from(embRecord.encTag),
        'EMBEDDING',
      );
      const floatArr = bufferToFloat32Array(decryptedBytes);
      samples.push(floatArr);
      if (embRecord.angle) {
        sampleAngles.push(embRecord.angle as FaceAngle);
      }
    }

    // Compute unit-norm mean centroid
    const centroidResult = computeCentroid(samples);

    // Consistency check against threshold
    const minThreshold = enrollmentConfig.minConsistencyCosine;
    if (centroidResult.minObservedSimilarity < minThreshold) {
      const inconsistentAngles: FaceAngle[] = [];
      for (let i = 0; i < centroidResult.similarities.length; i++) {
        if (centroidResult.similarities[i] < minThreshold) {
          inconsistentAngles.push(sampleAngles[i] || 'FRONT');
        }
      }

      throw new AppError(
        'ENROLLMENT_INCONSISTENT',
        400,
        'Inter-sample consistency check failed: one or more captures do not match the subject centroid',
        {
          inconsistentAngles,
          minObserved: Math.round(centroidResult.minObservedSimilarity * 1000) / 1000,
          threshold: minThreshold,
        },
      );
    }

    // Encrypt centroid
    const centroidBytes = float32ArrayToBuffer(centroidResult.centroid);
    const encCentroid = encryptAesGcm(centroidBytes, 'EMBEDDING');

    // Check system_settings for require_enrollment_approval
    const settingRow = await prisma.systemSetting.findUnique({
      where: { key: 'require_enrollment_approval' },
    });
    let requireApproval = true;
    if (settingRow) {
      const val = settingRow.value as { value?: boolean } | boolean;
      requireApproval = typeof val === 'boolean' ? val : val?.value ?? true;
    }

    const finalStatus: EnrollmentStatus = requireApproval ? 'PENDING_APPROVAL' : 'APPROVED';
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Store centroid (find existing by profile + CENTROID, then update or create)
      const existingCentroid = await tx.faceEmbedding.findFirst({
        where: {
          faceProfileId: draftProfile.id,
          kind: 'CENTROID',
        },
      });

      if (existingCentroid) {
        await tx.faceEmbedding.update({
          where: { id: existingCentroid.id },
          data: {
            ciphertext: new Uint8Array(encCentroid.ciphertext),
            encIv: new Uint8Array(encCentroid.iv),
            encTag: new Uint8Array(encCentroid.tag),
            encKeyVersion: encCentroid.keyVersion,
            dim: 512,
          },
        });
      } else {
        await tx.faceEmbedding.create({
          data: {
            faceProfileId: draftProfile.id,
            kind: 'CENTROID',
            angle: null,
            ciphertext: new Uint8Array(encCentroid.ciphertext),
            encIv: new Uint8Array(encCentroid.iv),
            encTag: new Uint8Array(encCentroid.tag),
            encKeyVersion: encCentroid.keyVersion,
            dim: 512,
            modelName: 'buffalo_l',
            modelVersion: '1.0',
          },
        });
      }

      // Update face profile
      await tx.faceProfile.update({
        where: { id: draftProfile.id },
        data: {
          status: finalStatus,
          submittedAt: now,
          approvedAt: requireApproval ? null : now,
          consistencyMinObserved: centroidResult.minObservedSimilarity,
          qualitySummary: {
            similarities: centroidResult.similarities.map((s) => Math.round(s * 1000) / 1000),
            minObservedSimilarity: Math.round(centroidResult.minObservedSimilarity * 1000) / 1000,
          },
        },
      });

      // Update student profile cache
      await tx.studentProfile.updateMany({
        where: { userId: studentUserId },
        data: { enrollmentStatusCache: finalStatus },
      });
    });

    await auditService.log({
      actorUserId: studentUserId,
      actorRole: 'STUDENT',
      action: requireApproval ? 'ENROLLMENT_SUBMITTED' : 'ENROLLMENT_AUTO_APPROVED',
      entityType: 'FACE_PROFILE',
      entityId: draftProfile.id,
      after: {
        status: finalStatus,
        consistencyMin: Math.round(centroidResult.minObservedSimilarity * 1000) / 1000,
      },
      reqIp,
      requestId,
    });

    return {
      profileId: draftProfile.id,
      status: finalStatus,
      submittedAt: now.toISOString(),
      approvedAt: requireApproval ? undefined : now.toISOString(),
      message: requireApproval
        ? 'Enrollment submitted successfully. Awaiting administrator review.'
        : 'Enrollment auto-approved. You are now verified for examinations.',
    };
  }

  async requestBiometricDeletion(studentUserId: string, reason?: string, reqIp?: string, requestId?: string) {
    const request = await prisma.dataDeletionRequest.create({
      data: {
        studentUserId,
        reason: reason || 'Student requested biometric profile deletion',
        status: 'PENDING',
      },
    });

    await auditService.log({
      actorUserId: studentUserId,
      actorRole: 'STUDENT',
      action: 'BIOMETRIC_DELETION_REQUESTED',
      entityType: 'DATA_DELETION_REQUEST',
      entityId: request.id,
      after: { status: 'PENDING', reason },
      reqIp,
      requestId,
    });

    return {
      id: request.id,
      status: 'PENDING',
      requestedAt: request.requestedAt.toISOString(),
    };
  }
}

export const enrollmentService = new EnrollmentService();

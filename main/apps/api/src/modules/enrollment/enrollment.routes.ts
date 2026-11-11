import { Router } from 'express';
import multer from 'multer';
import {
  consentInputSchema,
  deletionRequestSchema,
  faceAngleSchema,
  FaceAngle,
} from '@examguard/shared';
import { AppError } from '../../lib/errors.js';
import { enrollmentService } from './enrollment.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
});

export const enrollmentRouter = Router();

// POST /student/consent/biometric
enrollmentRouter.post('/consent/biometric', async (req, res, next) => {
  try {
    const parseRes = consentInputSchema.safeParse(req.body);
    if (!parseRes.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid consent payload', parseRes.error.format());
    }

    const result = await enrollmentService.recordConsent(
      req.user!.id,
      parseRes.data.accepted,
      parseRes.data.policyVersion,
      req.ip,
      req.headers['x-request-id'] as string,
    );

    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /student/enrollment
enrollmentRouter.get('/enrollment', async (req, res, next) => {
  try {
    const status = await enrollmentService.getEnrollmentStatus(req.user!.id);
    res.status(200).json({ data: status });
  } catch (err) {
    next(err);
  }
});

// POST /student/enrollment/start
enrollmentRouter.post('/enrollment/start', async (req, res, next) => {
  try {
    const status = await enrollmentService.startEnrollment(
      req.user!.id,
      req.ip,
      req.headers['x-request-id'] as string,
    );
    res.status(200).json({ data: status });
  } catch (err) {
    next(err);
  }
});

// POST /student/enrollment/preview-check
enrollmentRouter.post('/enrollment/preview-check', upload.single('frame'), async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      throw new AppError('VALIDATION_ERROR', 400, 'Missing frame file in multipart upload');
    }

    const angleParse = faceAngleSchema.safeParse(req.body.angle);
    if (!angleParse.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid or missing target angle', angleParse.error.format());
    }

    const result = await enrollmentService.previewCheck(req.file.buffer, angleParse.data);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /student/enrollment/captures
enrollmentRouter.post('/enrollment/captures', upload.single('frame'), async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      throw new AppError('VALIDATION_ERROR', 400, 'Missing frame file in multipart upload');
    }

    const angleParse = faceAngleSchema.safeParse(req.body.angle);
    if (!angleParse.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid or missing target angle', angleParse.error.format());
    }

    const result = await enrollmentService.captureAngle(
      req.user!.id,
      angleParse.data,
      req.file.buffer,
      req.ip,
      req.headers['x-request-id'] as string,
    );

    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// DELETE /student/enrollment/captures/:angle
enrollmentRouter.delete('/enrollment/captures/:angle', async (req, res, next) => {
  try {
    const angleParse = faceAngleSchema.safeParse(req.params.angle);
    if (!angleParse.success) {
      throw new AppError('VALIDATION_ERROR', 400, 'Invalid angle parameter');
    }

    const result = await enrollmentService.retakeAngle(
      req.user!.id,
      angleParse.data,
      req.ip,
      req.headers['x-request-id'] as string,
    );

    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /student/enrollment/finalize
enrollmentRouter.post('/enrollment/finalize', async (req, res, next) => {
  try {
    const result = await enrollmentService.finalizeEnrollment(
      req.user!.id,
      req.ip,
      req.headers['x-request-id'] as string,
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /student/biometric-deletion-requests
enrollmentRouter.post('/biometric-deletion-requests', async (req, res, next) => {
  try {
    const parseRes = deletionRequestSchema.safeParse(req.body);
    const reason = parseRes.success ? parseRes.data.reason : undefined;

    const result = await enrollmentService.requestBiometricDeletion(
      req.user!.id,
      reason,
      req.ip,
      req.headers['x-request-id'] as string,
    );

    res.status(202).json({ data: result });
  } catch (err) {
    next(err);
  }
});

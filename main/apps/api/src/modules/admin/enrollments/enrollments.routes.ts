import { Router } from 'express';
import { rejectEnrollmentSchema } from '@examguard/shared';
import { adminEnrollmentsService } from './enrollments.service.js';

export const enrollmentsRouter = Router();

/**
 * GET /admin/enrollments
 * List pending enrollment profiles with candidate information and photos for review.
 */
enrollmentsRouter.get('/enrollments', async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await adminEnrollmentsService.listEnrollments({
      status: status ? (String(status) as any) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/enrollments/:profileId/approve
 * Approve candidate enrollment profile.
 */
enrollmentsRouter.post('/enrollments/:profileId/approve', async (req, res, next) => {
  try {
    const actorUserId = req.user!.id;
    const requestId = (req as unknown as { id?: string }).id;
    const reqIp = req.ip || req.socket.remoteAddress;

    await adminEnrollmentsService.approveEnrollment(
      req.params.profileId,
      actorUserId,
      requestId,
      reqIp,
    );

    res.status(200).json({ data: { message: 'Enrollment profile approved successfully' } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/enrollments/:profileId/reject
 * Reject candidate enrollment profile with a reason.
 */
enrollmentsRouter.post('/enrollments/:profileId/reject', async (req, res, next) => {
  try {
    const { reason } = rejectEnrollmentSchema.parse(req.body);
    const actorUserId = req.user!.id;
    const requestId = (req as unknown as { id?: string }).id;
    const reqIp = req.ip || req.socket.remoteAddress;

    await adminEnrollmentsService.rejectEnrollment(
      req.params.profileId,
      reason,
      actorUserId,
      requestId,
      reqIp,
    );

    res.status(200).json({ data: { message: 'Enrollment profile rejected' } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/enrollments/:profileId/revoke
 * Revoke an existing approved enrollment profile.
 */
enrollmentsRouter.post('/enrollments/:profileId/revoke', async (req, res, next) => {
  try {
    const actorUserId = req.user!.id;
    const requestId = (req as unknown as { id?: string }).id;
    const reqIp = req.ip || req.socket.remoteAddress;

    await adminEnrollmentsService.revokeEnrollment(
      req.params.profileId,
      actorUserId,
      requestId,
      reqIp,
    );

    res.status(200).json({ data: { message: 'Enrollment profile revoked' } });
  } catch (err) {
    next(err);
  }
});

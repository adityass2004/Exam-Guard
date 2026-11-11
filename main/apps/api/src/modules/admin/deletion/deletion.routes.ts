import { Router } from 'express';
import { rejectDeletionRequestSchema } from '@examguard/shared';
import { adminDeletionService } from './deletion.service.js';

export const deletionRouter = Router();

/**
 * GET /admin/data-deletion-requests
 * View candidate data deletion requests.
 */
deletionRouter.get('/data-deletion-requests', async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await adminDeletionService.listRequests({
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
 * POST /admin/data-deletion-requests/:id/fulfill
 * Permanently purge candidate biometric images and embeddings.
 */
deletionRouter.post('/data-deletion-requests/:id/fulfill', async (req, res, next) => {
  try {
    const adminUserId = req.user!.id;
    const reqIp = req.ip || req.socket.remoteAddress;
    const reqId = (req as unknown as { id?: string }).id;

    const counts = await adminDeletionService.fulfillRequest(
      req.params.id,
      adminUserId,
      reqIp,
      reqId,
    );

    res.status(200).json({
      data: {
        message: 'Biometric records permanently purged and profile revoked successfully',
        counts,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/data-deletion-requests/:id/reject
 * Reject a candidate deletion request with an explanation.
 */
deletionRouter.post('/data-deletion-requests/:id/reject', async (req, res, next) => {
  try {
    const { note } = rejectDeletionRequestSchema.parse(req.body);
    const adminUserId = req.user!.id;
    const reqIp = req.ip || req.socket.remoteAddress;
    const reqId = (req as unknown as { id?: string }).id;

    await adminDeletionService.rejectRequest(
      req.params.id,
      note,
      adminUserId,
      reqIp,
      reqId,
    );

    res.status(200).json({
      data: {
        message: 'Data deletion request rejected',
      },
    });
  } catch (err) {
    next(err);
  }
});

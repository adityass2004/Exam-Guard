import { Router } from 'express';
import { updateStudentStatusSchema } from '@examguard/shared';
import { adminStudentsService } from './students.service.js';

export const studentsRouter = Router();

/**
 * GET /admin/students
 * List, search, filter and paginate students.
 */
studentsRouter.get('/students', async (req, res, next) => {
  try {
    const {
      search,
      enrollmentStatus,
      status,
      createdFrom,
      createdTo,
      page,
      limit,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await adminStudentsService.listStudents({
      search: search ? String(search) : undefined,
      enrollmentStatus: enrollmentStatus ? String(enrollmentStatus) : undefined,
      status: status ? (String(status) as any) : undefined,
      createdFrom: createdFrom ? String(createdFrom) : undefined,
      createdTo: createdTo ? String(createdTo) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy: sortBy ? (String(sortBy) as any) : undefined,
      sortOrder: sortOrder ? (String(sortOrder) as any) : undefined,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/students/:id
 * Retrieve detailed student profile, enrollment summary, and activity.
 */
studentsRouter.get('/students/:id', async (req, res, next) => {
  try {
    const data = await adminStudentsService.getStudent(req.params.id);
    res.status(200).json({ data });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /admin/students/:id
 * Suspend or reactivate student account.
 */
studentsRouter.patch('/students/:id', async (req, res, next) => {
  try {
    const { status } = updateStudentStatusSchema.parse(req.body);
    const actorUserId = req.user!.id;
    const requestId = (req as unknown as { id?: string }).id;
    const reqIp = req.ip || req.socket.remoteAddress;

    await adminStudentsService.updateStudentStatus(
      req.params.id,
      status,
      actorUserId,
      requestId,
      reqIp,
    );

    res.status(200).json({ data: { message: `Student account status updated to ${status}` } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/students/:id/reset-password
 * Issue one-time temporary password and require password change on next login.
 */
studentsRouter.post('/students/:id/reset-password', async (req, res, next) => {
  try {
    const actorUserId = req.user!.id;
    const requestId = (req as unknown as { id?: string }).id;
    const reqIp = req.ip || req.socket.remoteAddress;

    const result = await adminStudentsService.resetPassword(
      req.params.id,
      actorUserId,
      requestId,
      reqIp,
    );

    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /admin/students/:id
 * Soft delete student account.
 */
studentsRouter.delete('/students/:id', async (req, res, next) => {
  try {
    const actorUserId = req.user!.id;
    const requestId = (req as unknown as { id?: string }).id;
    const reqIp = req.ip || req.socket.remoteAddress;

    await adminStudentsService.softDeleteStudent(
      req.params.id,
      actorUserId,
      requestId,
      reqIp,
    );

    res.status(200).json({
      data: {
        message: 'Student account soft-deleted. Biometric records must be purged via the deletion request workflow.',
      },
    });
  } catch (err) {
    next(err);
  }
});

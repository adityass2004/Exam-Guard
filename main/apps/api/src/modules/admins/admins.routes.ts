import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { adminsService } from './admins.service.js';

export const adminsRouter = Router();

adminsRouter.use(requireAuth, requireRole('ADMIN'));

const createAdminSchema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2).max(120),
});

adminsRouter.get('/', async (_req, res, next) => {
  try {
    const admins = await adminsService.listAdmins();
    res.status(200).json({ data: admins });
  } catch (err) {
    next(err);
  }
});

adminsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid admin account details',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    const result = await adminsService.createAdmin(parsed.data, req.user!.id);
    res.status(201).json({ data: result });
    return;
  } catch (err) {
    next(err);
  }
});

adminsRouter.patch('/:id/deactivate', async (req, res, next) => {
  try {
    const result = await adminsService.deactivateAdmin(req.params.id, req.user!.id);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});


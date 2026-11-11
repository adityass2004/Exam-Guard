import { Router } from 'express';
import { healthService } from './health.service.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  const data = healthService.getLiveness();
  res.status(200).json({ data });
});

healthRouter.get('/health/ready', async (_req, res, next) => {
  try {
    const { httpStatus, data } = await healthService.getReadiness();
    res.status(httpStatus).json({ data });
  } catch (err) {
    next(err);
  }
});

export const systemRouter = Router();

systemRouter.get('/status', async (_req, res, next) => {
  try {
    const { httpStatus, data } = await healthService.getSystemStatus();
    res.status(httpStatus).json({ data });
  } catch (err) {
    next(err);
  }
});


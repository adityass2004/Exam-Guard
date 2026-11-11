import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { sessionsService } from './sessions.service.js';
import { preverifyService } from './preverify.service.js';
import { summaryService } from './summary.service.js';
import { verificationRoutes } from '../verification/verification.routes.js';
import { answerQuestionSchema } from '@examguard/shared';
import { AppError } from '../../lib/errors.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
});

export const studentExamsRouter = Router();
export const studentSessionsRouter = Router();

// Guards
studentExamsRouter.use(requireAuth, requireRole('STUDENT'));
studentSessionsRouter.use(requireAuth, requireRole('STUDENT'));

// Mount continuous verification and client-events sub-routes
studentSessionsRouter.use(verificationRoutes);

// --- Student Exams Endpoints ---

// GET /student/exams
studentExamsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exams = await sessionsService.listStudentExams(req.user!.id);
    res.json({ data: exams });
  } catch (err) {
    next(err);
  }
});

// POST /student/exams/:examId/sessions
studentExamsRouter.post(
  '/:examId/sessions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await sessionsService.createOrResumeSession(
        req.params.examId,
        req.user!.id,
        (req as any).id
      );
      res.status(201).json({ data: session });
    } catch (err) {
      next(err);
    }
  }
);

// --- Student Sessions Endpoints ---

// GET /student/sessions/:id
studentSessionsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await sessionsService.getSession(req.params.id, req.user!.id);
    res.json({ data: session });
  } catch (err) {
    next(err);
  }
});

// GET /student/sessions/:id/questions
studentSessionsRouter.get(
  '/:id/questions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const questions = await sessionsService.getQuestions(req.params.id, req.user!.id);
      res.json({ data: questions });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /student/sessions/:id/answers/:questionId
studentSessionsRouter.put(
  '/:id/answers/:questionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = answerQuestionSchema.parse(req.body);
      const result = await sessionsService.answerQuestion(
        req.params.id,
        req.params.questionId,
        parsed.optionId,
        req.user!.id
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /student/sessions/:id/pre-verification
studentSessionsRouter.post(
  '/:id/pre-verification',
  upload.single('frame'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file || !req.file.buffer) {
        throw new AppError('VALIDATION_ERROR', 400, 'Multipart frame image is required');
      }
      const result = await preverifyService.runPreVerification(
        req.params.id,
        req.user!.id,
        req.file.buffer
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /student/sessions/:id/start
studentSessionsRouter.post(
  '/:id/start',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await sessionsService.startSession(req.params.id, req.user!.id);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /student/sessions/:id/submit
studentSessionsRouter.post(
  '/:id/submit',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await sessionsService.submitSession(req.params.id, req.user!.id);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// GET /student/sessions/:id/summary
studentSessionsRouter.get(
  '/:id/summary',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await summaryService.getSessionSummary(req.params.id, req.user!.id);
      res.json({ data: summary });
    } catch (err) {
      next(err);
    }
  }
);

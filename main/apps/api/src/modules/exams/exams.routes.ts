import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { examsService } from './exams.service.js';
import { questionsService } from './questions.service.js';
import {
  createExamSchema,
  updateExamSchema,
  createQuestionSchema,
  updateQuestionSchema,
  reorderQuestionsSchema,
} from '@examguard/shared';

export const adminExamsRouter = Router();

adminExamsRouter.use(requireAuth, requireRole('ADMIN'));

// List exams
adminExamsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await examsService.listExams({
      search: req.query.search as string,
      status: req.query.status as any,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ data: result.data, meta: result.meta });
  } catch (err) {
    next(err);
  }
});

// Create exam
adminExamsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createExamSchema.parse(req.body);
    const exam = await examsService.createExam(parsed, req.user!.id, (req as any).id);
    res.status(201).json({ data: exam });
  } catch (err) {
    next(err);
  }
});

// Get exam details
adminExamsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exam = await examsService.getExam(req.params.id);
    res.json({ data: exam });
  } catch (err) {
    next(err);
  }
});

// Update exam
adminExamsRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateExamSchema.parse(req.body);
    const updated = await examsService.updateExam(
      req.params.id,
      parsed,
      req.user!.id,
      (req as any).id
    );
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// Delete exam (soft delete, blocked if sessions exist)
adminExamsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await examsService.deleteExam(req.params.id, req.user!.id, (req as any).id);
    res.json({ message: 'Exam deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// Activate exam
adminExamsRouter.post('/:id/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activated = await examsService.activateExam(
      req.params.id,
      req.user!.id,
      (req as any).id
    );
    res.json({ data: activated });
  } catch (err) {
    next(err);
  }
});

// Deactivate exam
adminExamsRouter.post('/:id/deactivate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deactivated = await examsService.deactivateExam(
      req.params.id,
      req.user!.id,
      (req as any).id
    );
    res.json({ data: deactivated });
  } catch (err) {
    next(err);
  }
});

// Participants
adminExamsRouter.get('/:id/participants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await examsService.getParticipants(req.params.id, {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ data: result.data, meta: result.meta });
  } catch (err) {
    next(err);
  }
});

// Add question
adminExamsRouter.post('/:id/questions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createQuestionSchema.parse(req.body);
    const question = await questionsService.addQuestion(
      req.params.id,
      parsed,
      req.user!.id,
      (req as any).id
    );
    res.status(201).json({ data: question });
  } catch (err) {
    next(err);
  }
});

// Update question
adminExamsRouter.patch(
  '/:id/questions/:questionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = updateQuestionSchema.parse(req.body);
      const question = await questionsService.updateQuestion(
        req.params.id,
        req.params.questionId,
        parsed,
        req.user!.id,
        (req as any).id
      );
      res.json({ data: question });
    } catch (err) {
      next(err);
    }
  }
);

// Delete question
adminExamsRouter.delete(
  '/:id/questions/:questionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await questionsService.deleteQuestion(
        req.params.id,
        req.params.questionId,
        req.user!.id,
        (req as any).id
      );
      res.json({ message: 'Question deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// Reorder questions
adminExamsRouter.put(
  '/:id/questions/order',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = reorderQuestionsSchema.parse(req.body);
      await questionsService.reorderQuestions(
        req.params.id,
        parsed.questionIds,
        req.user!.id,
        (req as any).id
      );
      res.json({ message: 'Questions reordered successfully' });
    } catch (err) {
      next(err);
    }
  }
);

import { z } from 'zod';

export const reportQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  examId: z.string().trim().optional(),
  studentId: z.string().trim().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;


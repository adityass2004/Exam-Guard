import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load .env file if available
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const base64Key32BytesSchema = z
  .string()
  .min(1, 'Key is required')
  .refine(
    (val) => val !== 'REPLACE_ME',
    'Key cannot be the placeholder REPLACE_ME',
  )
  .refine((val) => {
    try {
      const buf = Buffer.from(val, 'base64');
      return buf.length === 32;
    } catch {
      return false;
    }
  }, 'Key must be a valid Base64 string that decodes to exactly 32 bytes');

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    WEB_PORT: z.coerce.number().int().positive().default(3000),
    API_PORT: z.coerce.number().int().positive().default(4000),
    VISION_PORT: z.coerce.number().int().positive().default(8000),
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
    API_URL: z.string().url().default('http://localhost:4000'),
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .refine(
        (url) => !url.includes('REPLACE_ME'),
        'DATABASE_URL contains placeholder REPLACE_ME',
      ),
    TEST_DATABASE_URL: z.string().optional().default('mysql://examguard:examguard_dev_password@localhost:3306/examguard_test'),
    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(8),
    EMBEDDING_ENCRYPTION_KEY: z.string(),
    IMAGE_ENCRYPTION_KEY: z.string(),
    ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
    STORAGE_ROOT: z.string().default('./storage'),
    VISION_URL: z.string().url().default('http://127.0.0.1:8000'),
    VISION_INTERNAL_KEY: z.string().min(1, 'VISION_INTERNAL_KEY is required'),
    VISION_TIMEOUT_MS: z.coerce.number().int().positive().default(4000),
    VISION_MODEL_DIR: z.string().default('./services/vision/models'),
    VISION_ALLOW_MODEL_DOWNLOAD: z
      .union([z.boolean(), z.string()])
      .transform((val) => (typeof val === 'boolean' ? val : val.toLowerCase() === 'true'))
      .default(true),
    VISION_MAX_CONCURRENCY: z.coerce.number().int().positive().default(2),
    SEED_ADMIN_EMAIL: z.string().email().default('admin@examguard.local'),
    SEED_ADMIN_PASSWORD: z.string().min(8, 'SEED_ADMIN_PASSWORD must be at least 8 characters'),
    SEED_STUDENT_EMAIL: z.string().email().default('student@examguard.local'),
    SEED_STUDENT_PASSWORD: z.string().min(8, 'SEED_STUDENT_PASSWORD must be at least 8 characters'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  .superRefine((data, ctx) => {
    // In non-test environments, enforce strict encryption keys and secrets
    if (data.NODE_ENV !== 'test') {
      const embKeyResult = base64Key32BytesSchema.safeParse(data.EMBEDDING_ENCRYPTION_KEY);
      if (!embKeyResult.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMBEDDING_ENCRYPTION_KEY'],
          message: embKeyResult.error.issues[0]?.message || 'Invalid EMBEDDING_ENCRYPTION_KEY',
        });
      }

      const imgKeyResult = base64Key32BytesSchema.safeParse(data.IMAGE_ENCRYPTION_KEY);
      if (!imgKeyResult.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['IMAGE_ENCRYPTION_KEY'],
          message: imgKeyResult.error.issues[0]?.message || 'Invalid IMAGE_ENCRYPTION_KEY',
        });
      }

      if (data.VISION_INTERNAL_KEY === 'REPLACE_ME') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['VISION_INTERNAL_KEY'],
          message: 'VISION_INTERNAL_KEY cannot be placeholder REPLACE_ME',
        });
      }

      if (data.SEED_ADMIN_PASSWORD === 'REPLACE_ME') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SEED_ADMIN_PASSWORD'],
          message: 'SEED_ADMIN_PASSWORD cannot be placeholder REPLACE_ME',
        });
      }

      if (data.SEED_STUDENT_PASSWORD === 'REPLACE_ME') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SEED_STUDENT_PASSWORD'],
          message: 'SEED_STUDENT_PASSWORD cannot be placeholder REPLACE_ME',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => ` - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed fast on startup:\n${errorDetails}`);
  }
  return result.data;
}

// In test environment or normal run, provide singleton config
let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    // If running in test and missing required keys, inject safe mock keys
    if (process.env.NODE_ENV === 'test') {
      const defaults: Record<string, string> = {
        DATABASE_URL: 'mysql://examguard:examguard_dev_password@localhost:3306/examguard_test',
        EMBEDDING_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
        IMAGE_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
        VISION_INTERNAL_KEY: 'test_internal_key',
        SEED_ADMIN_PASSWORD: 'ValidAdminPass!123',
        SEED_STUDENT_PASSWORD: 'ValidStudentPass!123',
      };
      for (const [k, v] of Object.entries(defaults)) {
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    }
    cachedEnv = parseEnv(process.env);
  }
  return cachedEnv;
}

export const env = getEnv();


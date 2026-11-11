import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('Environment validation', () => {
  const validBase = {
    NODE_ENV: 'development',
    WEB_PORT: '3000',
    API_PORT: '4000',
    VISION_PORT: '8000',
    WEB_ORIGIN: 'http://localhost:3000',
    API_URL: 'http://localhost:4000',
    DATABASE_URL: 'mysql://examguard:pass@localhost:3306/examguard',
    EMBEDDING_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    IMAGE_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
    VISION_INTERNAL_KEY: 'valid_secret_key',
    SEED_ADMIN_PASSWORD: 'ValidAdminPassword123!',
    SEED_STUDENT_PASSWORD: 'ValidStudentPassword123!',
  };

  it('succeeds with valid configuration', () => {
    const env = parseEnv(validBase);
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('fails fast on missing required variables like DATABASE_URL', () => {
    const invalid = { ...validBase, DATABASE_URL: '' };
    expect(() => parseEnv(invalid)).toThrow(/DATABASE_URL is required/);
  });

  it('rejects REPLACE_ME placeholder in DATABASE_URL', () => {
    const invalid = { ...validBase, DATABASE_URL: 'mysql://user:REPLACE_ME@localhost/db' };
    expect(() => parseEnv(invalid)).toThrow(/contains placeholder REPLACE_ME/);
  });

  it('rejects REPLACE_ME placeholder in encryption keys', () => {
    const invalid = { ...validBase, EMBEDDING_ENCRYPTION_KEY: 'REPLACE_ME' };
    expect(() => parseEnv(invalid)).toThrow(/Key cannot be the placeholder REPLACE_ME/);
  });

  it('rejects keys that do not decode to exactly 32 bytes', () => {
    // 16 bytes base64
    const shortKey = Buffer.alloc(16, 1).toString('base64');
    const invalid = { ...validBase, EMBEDDING_ENCRYPTION_KEY: shortKey };
    expect(() => parseEnv(invalid)).toThrow(/must be a valid Base64 string that decodes to exactly 32 bytes/);
  });

  it('rejects short passwords', () => {
    const invalid = { ...validBase, SEED_ADMIN_PASSWORD: 'short' };
    expect(() => parseEnv(invalid)).toThrow(/must be at least 8 characters/);
  });
});


import { describe, expect, it } from 'vitest';
import {
  dummyVerify,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from './password.js';

describe('Password Management & Argon2id', () => {
  it('enforces password policy', () => {
    expect(validatePasswordPolicy('short').valid).toBe(false);
    expect(validatePasswordPolicy('password1234').valid).toBe(false); // Common password
    expect(validatePasswordPolicy('ValidSecurePassword2026!').valid).toBe(true);
  });

  it('hashes and verifies password using Argon2id', async () => {
    const raw = 'SuperSecretSecurePassword!2026';
    const hash = await hashPassword(raw);
    expect(hash).toContain('$argon2id$');

    const isValid = await verifyPassword(raw, hash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('WrongPassword123!', hash);
    expect(isInvalid).toBe(false);
  });

  it('dummyVerify completes and always returns false', async () => {
    const res = await dummyVerify();
    expect(res).toBe(false);
  });
});


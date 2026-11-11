import argon2 from 'argon2';

const COMMON_PASSWORDS = new Set([
  'password1234',
  'password12345',
  '123456789012',
  'administrator1',
  'adminpassword1',
  'examguard1234',
  'welcome123456',
  'letmein123456',
]);

// Precomputed dummy hash for timing attack mitigation when user does not exist
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash('dummy_timing_mitigation_password', {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }
  return dummyHashPromise;
}

export function validatePasswordPolicy(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password cannot exceed 128 characters' };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, error: 'Password is too common or easily guessable' };
  }
  return { valid: true };
}

export async function hashPassword(password: string): Promise<string> {
  const policy = validatePasswordPolicy(password);
  if (!policy.valid) {
    throw new Error(policy.error || 'Password does not meet security requirements');
  }

  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function dummyVerify(): Promise<boolean> {
  try {
    const dummy = await getDummyHash();
    await argon2.verify(dummy, 'dummy_mismatch');
    return false;
  } catch {
    return false;
  }
}


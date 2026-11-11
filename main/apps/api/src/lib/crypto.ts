import crypto from 'node:crypto';
import { env } from '../config/env.js';

export type KeyKind = 'EMBEDDING' | 'IMAGE';

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyVersion: number;
}

function getKey(keyKind: KeyKind): Buffer {
  const base64Key =
    keyKind === 'EMBEDDING' ? env.EMBEDDING_ENCRYPTION_KEY : env.IMAGE_ENCRYPTION_KEY;
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) {
    throw new Error(`Encryption key for ${keyKind} must be exactly 32 bytes`);
  }
  return key;
}

export function encryptAesGcm(
  plaintext: Buffer | string,
  keyKind: KeyKind,
  customKey?: Buffer,
): EncryptedPayload {
  const key = customKey ?? getKey(keyKind);
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const inputBuffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf-8');
  const ciphertext = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    iv,
    tag,
    keyVersion: env.ENCRYPTION_KEY_VERSION,
  };
}

export function decryptAesGcm(
  ciphertext: Buffer,
  iv: Buffer,
  tag: Buffer,
  keyKind: KeyKind,
  customKey?: Buffer,
): Buffer {
  const key = customKey ?? getKey(keyKind);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function sha256Hex(data: Buffer | string): string {
  const hash = crypto.createHash('sha256');
  if (Buffer.isBuffer(data)) {
    hash.update(data);
  } else {
    hash.update(data, 'utf-8');
  }
  return hash.digest('hex');
}

export function randomToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}


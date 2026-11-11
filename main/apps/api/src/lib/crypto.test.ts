import { describe, expect, it } from 'vitest';
import {
  constantTimeEqual,
  decryptAesGcm,
  encryptAesGcm,
  randomToken,
  sha256Hex,
} from './crypto.js';

describe('Crypto Helpers', () => {
  const secretData = 'BiometricVectorAndEvidenceSecretPayload-2026';

  it('performs round-trip AES-256-GCM encryption and decryption for EMBEDDING', () => {
    const encrypted = encryptAesGcm(secretData, 'EMBEDDING');
    expect(encrypted.iv.length).toBe(12);
    expect(encrypted.tag.length).toBe(16);
    expect(encrypted.ciphertext.length).toBeGreaterThan(0);

    const decrypted = decryptAesGcm(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      'EMBEDDING',
    );
    expect(decrypted.toString('utf-8')).toBe(secretData);
  });

  it('performs round-trip AES-256-GCM encryption and decryption for IMAGE', () => {
    const encrypted = encryptAesGcm(secretData, 'IMAGE');
    const decrypted = decryptAesGcm(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      'IMAGE',
    );
    expect(decrypted.toString('utf-8')).toBe(secretData);
  });

  it('detects tampering with ciphertext, IV, or auth tag', () => {
    const encrypted = encryptAesGcm(secretData, 'EMBEDDING');

    // Tampered ciphertext
    const tamperedCipher = Buffer.from(encrypted.ciphertext);
    tamperedCipher[0] ^= 0xff;
    expect(() =>
      decryptAesGcm(tamperedCipher, encrypted.iv, encrypted.tag, 'EMBEDDING'),
    ).toThrow();

    // Tampered IV
    const tamperedIv = Buffer.from(encrypted.iv);
    tamperedIv[0] ^= 0xff;
    expect(() =>
      decryptAesGcm(encrypted.ciphertext, tamperedIv, encrypted.tag, 'EMBEDDING'),
    ).toThrow();

    // Tampered Tag
    const tamperedTag = Buffer.from(encrypted.tag);
    tamperedTag[0] ^= 0xff;
    expect(() =>
      decryptAesGcm(encrypted.ciphertext, encrypted.iv, tamperedTag, 'EMBEDDING'),
    ).toThrow();
  });

  it('fails decryption when decrypted with wrong key', () => {
    const encrypted = encryptAesGcm(secretData, 'EMBEDDING');
    const wrongKey = Buffer.alloc(32, 99);
    expect(() =>
      decryptAesGcm(encrypted.ciphertext, encrypted.iv, encrypted.tag, 'EMBEDDING', wrongKey),
    ).toThrow();
  });

  it('generates unique initialization vectors (IVs) across many calls', () => {
    const ivs = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const encrypted = encryptAesGcm('test-payload', 'EMBEDDING');
      ivs.add(encrypted.iv.toString('hex'));
    }
    expect(ivs.size).toBe(100);
  });

  it('computes consistent sha256Hex', () => {
    const hash1 = sha256Hex('hello-examguard');
    const hash2 = sha256Hex(Buffer.from('hello-examguard'));
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('generates random tokens of specified byte length', () => {
    const tok = randomToken(32);
    expect(tok).toHaveLength(64); // 32 bytes hex = 64 characters
  });

  it('constantTimeEqual correctly compares strings', () => {
    expect(constantTimeEqual('matching-token', 'matching-token')).toBe(true);
    expect(constantTimeEqual('matching-token', 'mismatched-token')).toBe(false);
    expect(constantTimeEqual('token1', 'token12')).toBe(false);
  });
});


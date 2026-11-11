import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import sharp from 'sharp';
import {
  readDecryptedImage,
  resolveSafeStoragePath,
  storeEncryptedImage,
} from '../../src/lib/storage.js';
import { decryptAesGcm, encryptAesGcm } from '../../src/lib/crypto.js';

describe('Security Hardening - Encryption At Rest for Biometrics', () => {
  it('ensures face images on disk are AES-256-GCM ciphertext and do NOT contain JPEG magic bytes', async () => {
    // Generate valid JPEG
    const originalPlaintext = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 50, g: 100, b: 150 },
      },
    })
      .jpeg()
      .toBuffer();

    // Verify original has JPEG magic bytes 0xFF, 0xD8, 0xFF
    expect(originalPlaintext[0]).toBe(0xff);
    expect(originalPlaintext[1]).toBe(0xd8);
    expect(originalPlaintext[2]).toBe(0xff);

    // Store encrypted image
    const stored = await storeEncryptedImage({
      kind: 'enrollment',
      bytes: originalPlaintext,
    });

    const absolutePath = resolveSafeStoragePath(stored.relativePath);
    const rawDiskFile = await fs.promises.readFile(absolutePath);

    // Verify on-disk file is ciphertext and does NOT match standard JPEG magic header
    const hasJpegMagic =
      rawDiskFile.length >= 3 &&
      rawDiskFile[0] === 0xff &&
      rawDiskFile[1] === 0xd8 &&
      rawDiskFile[2] === 0xff;
    expect(hasJpegMagic).toBe(false);

    // Verify reading via decryption recovers valid JPEG with matching SHA-256
    const decrypted = await readDecryptedImage({
      relativePath: stored.relativePath,
      iv: stored.iv,
      tag: stored.tag,
      keyVersion: stored.keyVersion,
      expectedSha256: stored.sha256,
    });

    expect(decrypted[0]).toBe(0xff);
    expect(decrypted[1]).toBe(0xd8);
    expect(decrypted[2]).toBe(0xff);

    // Cleanup test file
    await fs.promises.unlink(absolutePath).catch(() => {});
  });

  it('ensures face embeddings are encrypted with AES-256-GCM and cannot be read as raw float bytes', () => {
    // 512-d mock embedding
    const floats = new Float32Array(512);
    for (let i = 0; i < 512; i++) floats[i] = (i - 256) / 256.0;
    const rawBytes = Buffer.from(floats.buffer);

    const encrypted = encryptAesGcm(rawBytes, 'EMBEDDING');

    // Ciphertext must differ from plaintext
    expect(encrypted.ciphertext.equals(rawBytes)).toBe(false);

    // Decrypting recovers exact original floats
    const decrypted = decryptAesGcm(encrypted.ciphertext, encrypted.iv, encrypted.tag, 'EMBEDDING');
    expect(decrypted.equals(rawBytes)).toBe(true);

    const recoveredFloats = new Float32Array(
      decrypted.buffer,
      decrypted.byteOffset,
      decrypted.byteLength / Float32Array.BYTES_PER_ELEMENT
    );
    expect(recoveredFloats.length).toBe(512);
    expect(recoveredFloats[0]).toBeCloseTo(floats[0], 5);
    expect(recoveredFloats[511]).toBeCloseTo(floats[511], 5);
  });
});


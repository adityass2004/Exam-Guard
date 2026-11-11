import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import {
  deleteStoredFile,
  EvidenceIntegrityError,
  readDecryptedImage,
  resolveSafeStoragePath,
  storeEncryptedImage,
} from './storage.js';

describe('Encrypted File Storage Library', () => {
  let sampleJpeg: Buffer;

  beforeAll(async () => {
    // Generate valid 100x100 JPEG buffer
    sampleJpeg = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 128, g: 128, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();
  });

  it('stores and decrypts an image cleanly with integrity verification', async () => {
    const stored = await storeEncryptedImage({
      kind: 'enrollment',
      bytes: sampleJpeg,
    });

    expect(stored.relativePath).toMatch(/^enrollment\/[a-f0-9]{2}\/[a-f0-9-]+\.bin$/);
    expect(stored.mime).toBe('image/jpeg');
    expect(stored.width).toBe(100);
    expect(stored.height).toBe(100);
    expect(stored.sha256).toBeDefined();

    // Verify disk content is ciphertext (not identical to plaintext sampleJpeg)
    const rawDisk = await fs.promises.readFile(resolveSafeStoragePath(stored.relativePath));
    expect(rawDisk.equals(sampleJpeg)).toBe(false);

    // Read back and decrypt
    const decrypted = await readDecryptedImage({
      relativePath: stored.relativePath,
      iv: stored.iv,
      tag: stored.tag,
      expectedSha256: stored.sha256,
    });

    // Decrypted matches re-encoded JPEG
    expect(decrypted.length).toBe(stored.byteSize);

    // Clean up
    await deleteStoredFile(stored.relativePath);
  });

  it('detects tampering and throws EvidenceIntegrityError', async () => {
    const stored = await storeEncryptedImage({
      kind: 'evidence',
      bytes: sampleJpeg,
    });

    // Tamper with disk ciphertext
    const absPath = resolveSafeStoragePath(stored.relativePath);
    const diskContent = await fs.promises.readFile(absPath);
    diskContent[0] = diskContent[0] ^ 0xff; // Flip bits
    await fs.promises.writeFile(absPath, diskContent);

    // Expect decrypt to fail authentication
    await expect(
      readDecryptedImage({
        relativePath: stored.relativePath,
        iv: stored.iv,
        tag: stored.tag,
        expectedSha256: stored.sha256,
      }),
    ).rejects.toThrow(EvidenceIntegrityError);

    // Clean up
    await deleteStoredFile(stored.relativePath);
  });

  it('detects checksum mismatch when expectedSha256 differs', async () => {
    const stored = await storeEncryptedImage({
      kind: 'evidence',
      bytes: sampleJpeg,
    });

    await expect(
      readDecryptedImage({
        relativePath: stored.relativePath,
        iv: stored.iv,
        tag: stored.tag,
        expectedSha256: '0000000000000000000000000000000000000000000000000000000000000000',
      }),
    ).rejects.toThrow(EvidenceIntegrityError);

    await deleteStoredFile(stored.relativePath);
  });

  it('guards strictly against path traversal attempts', () => {
    expect(() => resolveSafeStoragePath('../../../etc/passwd')).toThrow(/traversal/i);
    expect(() => resolveSafeStoragePath('enrollment/../../escape.bin')).toThrow(/traversal/i);
    expect(() => resolveSafeStoragePath('/absolute/path')).toThrow(/traversal/i);
  });

  it('rejects corrupt or unsupported non-image files', async () => {
    const corruptBytes = Buffer.from('this is plain text and not an image at all');
    await expect(
      storeEncryptedImage({
        kind: 'enrollment',
        bytes: corruptBytes,
      }),
    ).rejects.toThrow(/unsupported image type/i);
  });

  it('deletes stored files idempotently', async () => {
    const stored = await storeEncryptedImage({
      kind: 'enrollment',
      bytes: sampleJpeg,
    });

    const deletedFirst = await deleteStoredFile(stored.relativePath);
    expect(deletedFirst).toBe(true);

    const deletedSecond = await deleteStoredFile(stored.relativePath);
    expect(deletedSecond).toBe(false);
  });
});

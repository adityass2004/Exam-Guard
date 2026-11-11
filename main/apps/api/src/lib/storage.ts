import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp, { type Metadata } from 'sharp';
import { env } from '../config/env.js';
import { AppError } from './errors.js';
import { constantTimeEqual, decryptAesGcm, encryptAesGcm, sha256Hex } from './crypto.js';

export class EvidenceIntegrityError extends AppError {
  constructor(message = 'Evidence integrity verification failed') {
    super('EVIDENCE_INTEGRITY_FAILED', 400, message);
  }
}

export type StorageKind = 'enrollment' | 'evidence';

export interface StoreEncryptedImageInput {
  kind: StorageKind;
  bytes: Buffer;
}

export interface StoredImageRecord {
  relativePath: string;
  sha256: string;
  mime: string;
  byteSize: number;
  width: number;
  height: number;
  iv: Buffer;
  tag: Buffer;
  keyVersion: number;
}

export interface ReadDecryptedImageInput {
  relativePath: string;
  iv: Buffer;
  tag: Buffer;
  keyVersion?: number;
  expectedSha256?: string;
}

export function resolveSafeStoragePath(relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('..')) {
    throw new AppError('SECURITY_VIOLATION', 403, 'Path traversal attempt detected');
  }

  const root = path.resolve(env.STORAGE_ROOT);
  const absolutePath = path.resolve(root, relativePath);

  if (!absolutePath.startsWith(root + path.sep)) {
    throw new AppError('SECURITY_VIOLATION', 403, 'Path traversal attempt detected');
  }

  return absolutePath;
}

export async function storeEncryptedImage(
  input: StoreEncryptedImageInput,
): Promise<StoredImageRecord> {
  const { kind, bytes } = input;

  if (!bytes || bytes.length === 0) {
    throw new AppError('INVALID_IMAGE', 400, 'Image payload cannot be empty');
  }

  if (bytes.length > 2 * 1024 * 1024) {
    throw new AppError('INVALID_IMAGE', 400, 'Image payload exceeds 2 MB limit');
  }

  // 1. Validate magic bytes for JPEG / PNG
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;

  if (!isJpeg && !isPng) {
    throw new AppError('INVALID_IMAGE', 400, 'Unsupported image type: must be JPEG or PNG');
  }

  // 2. Re-encode with sharp (strip EXIF metadata, cap max dimensions to 1920, compress to JPEG)
  let reencoded: Buffer;
  let metadata: Metadata;

  try {
    const pipeline = sharp(bytes, { failOn: 'error' })
      .rotate() // auto-orient based on orientation tag
      .resize({
        width: 1920,
        height: 1920,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: false });

    reencoded = await pipeline.toBuffer();
    metadata = await sharp(reencoded).metadata();
  } catch (err: unknown) {
    throw new AppError('INVALID_IMAGE', 400, 'Corrupt image or failed decompression');
  }

  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (width === 0 || height === 0 || width > 4096 || height > 4096) {
    throw new AppError('INVALID_IMAGE', 400, `Image dimensions (${width}x${height}) exceed limit`);
  }

  // 3. Compute SHA-256 of the re-encoded plaintext
  const sha256 = sha256Hex(reencoded);

  // 4. Encrypt with AES-256-GCM using IMAGE_ENCRYPTION_KEY
  const encrypted = encryptAesGcm(reencoded, 'IMAGE');

  // 5. Structure storage path: <kind>/<bucket>/<uuid>.bin
  const fileId = crypto.randomUUID();
  const bucket = fileId.slice(0, 2);
  const relativePath = path.join(kind, bucket, `${fileId}.bin`).replace(/\\/g, '/');
  const targetPath = resolveSafeStoragePath(relativePath);

  // 6. Atomic write: write to STORAGE_ROOT/tmp first, then rename
  const tmpDir = path.resolve(env.STORAGE_ROOT, 'tmp');
  const targetDir = path.dirname(targetPath);

  await fs.promises.mkdir(tmpDir, { recursive: true });
  await fs.promises.mkdir(targetDir, { recursive: true });

  const tmpPath = path.join(tmpDir, `tmp-${fileId}.bin`);

  try {
    await fs.promises.writeFile(tmpPath, encrypted.ciphertext);
    await fs.promises.rename(tmpPath, targetPath);
  } catch (err: unknown) {
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
      // ignore
    }
    throw new AppError('STORAGE_ERROR', 500, 'Failed to persist encrypted image');
  }

  return {
    relativePath,
    sha256,
    mime: 'image/jpeg',
    byteSize: reencoded.length,
    width,
    height,
    iv: encrypted.iv,
    tag: encrypted.tag,
    keyVersion: encrypted.keyVersion,
  };
}

export async function readDecryptedImage(
  input: ReadDecryptedImageInput,
): Promise<Buffer> {
  const { relativePath, iv, tag, expectedSha256 } = input;
  const targetPath = resolveSafeStoragePath(relativePath);

  let ciphertext: Buffer;
  try {
    ciphertext = await fs.promises.readFile(targetPath);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new AppError('NOT_FOUND', 404, 'Stored image file not found');
    }
    throw new AppError('STORAGE_ERROR', 500, 'Failed to read image file from disk');
  }

  let plaintext: Buffer;
  try {
    plaintext = decryptAesGcm(ciphertext, iv, tag, 'IMAGE');
  } catch (err: unknown) {
    throw new EvidenceIntegrityError('Decryption authentication failed: image may have been tampered with');
  }

  if (expectedSha256) {
    const actualSha256 = sha256Hex(plaintext);
    if (!constantTimeEqual(actualSha256, expectedSha256)) {
      throw new EvidenceIntegrityError(
        `Evidence checksum mismatch: expected ${expectedSha256}, observed ${actualSha256}`,
      );
    }
  }

  return plaintext;
}

export async function deleteStoredFile(relativePath: string): Promise<boolean> {
  try {
    const targetPath = resolveSafeStoragePath(relativePath);
    await fs.promises.unlink(targetPath);
    return true;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return false; // idempotent
    }
    throw new AppError('STORAGE_ERROR', 500, `Failed to delete file: ${err.message}`);
  }
}

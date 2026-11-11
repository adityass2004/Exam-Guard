import { describe, expect, it } from 'vitest';
import { createLogger, REDACTED_PATHS } from '../../src/lib/logger.js';
import stream from 'node:stream';

describe('Security Hardening - Log Redaction and Sensitive Data Scan', () => {
  it('redacts passwords, tokens, cookies, embeddings and image payloads in logs', async () => {
    let loggedData = '';
    const writable = new stream.Writable({
      write(chunk, _encoding, callback) {
        loggedData += chunk.toString();
        callback();
      },
    });

    const testLogger = createLogger({ level: 'debug' }, writable);

    const sensitiveSample = {
      password: 'SuperSecretPassword123!',
      token: 'sess_987654321_abcdef',
      cookie: 'eg_session=abc123xyz',
      authorization: 'Bearer token_secret_123',
      embedding: [0.123, -0.456, 0.789],
      frame: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
      image: 'base64_encoded_raw_biometric_data...',
      safeField: 'User login attempt',
    };

    testLogger.info(sensitiveSample, 'Test log entry');

    // Asserts none of the sensitive values are present in plain text
    expect(loggedData).not.toContain('SuperSecretPassword123!');
    expect(loggedData).not.toContain('sess_987654321_abcdef');
    expect(loggedData).not.toContain('eg_session=abc123xyz');
    expect(loggedData).not.toContain('Bearer token_secret_123');
    expect(loggedData).not.toContain('base64_encoded_raw_biometric_data');
    expect(loggedData).toContain('[REDACTED]');
    expect(loggedData).toContain('safeField');
  });

  it('ensures REDACTED_PATHS covers all mandatory compliance categories', () => {
    const requiredCategories = ['password', 'token', 'cookie', 'authorization', 'embedding', 'frame', 'image'];
    for (const cat of requiredCategories) {
      expect(REDACTED_PATHS).toContain(cat);
    }
  });
});


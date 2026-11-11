import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';

describe('Logger Redaction', () => {
  it('redacts sensitive fields from logged objects', () => {
    let output = '';
    const destination = {
      write(chunk: string) {
        output += chunk;
      },
    };

    const testLogger = createLogger({ level: 'info' }, destination);

    testLogger.info({
      user: {
        id: 'u123',
        password: 'SuperSecretPassword',
      },
      token: 'secret-token-123',
      cookie: 'eg_session=secret-cookie',
      authorization: 'Bearer secret-jwt',
      embedding: [0.123, 0.456, 0.789],
      frame: 'base64-image-bytes-abcdef',
      image: 'raw-image-bytes-123456',
      req: {
        headers: {
          cookie: 'secret-cookie-in-header',
          authorization: 'Bearer header-secret',
        },
      },
    });

    expect(output).not.toContain('SuperSecretPassword');
    expect(output).not.toContain('secret-token-123');
    expect(output).not.toContain('secret-cookie');
    expect(output).not.toContain('secret-jwt');
    expect(output).not.toContain('base64-image-bytes-abcdef');
    expect(output).not.toContain('raw-image-bytes-123456');
    expect(output).not.toContain('secret-cookie-in-header');
    expect(output).not.toContain('header-secret');
    expect(output).toContain('[REDACTED]');
  });
});


import { describe, expect, it } from 'vitest';
import { scrubAuditJson } from './audit.service.js';

describe('Audit Log Scrubber', () => {
  it('scrubs sensitive credentials and biometric fields from before/after objects', () => {
    const rawData = {
      user: 'john_doe',
      password: 'PlainPassword123',
      passwordHash: '$argon2id$v=19$...',
      token: 'session-token-secret',
      tokenHash: 'abc123hash',
      cookie: 'eg_session=xyz',
      nested: {
        authorization: 'Bearer secret-jwt',
        embedding: [0.1, 0.2, 0.3],
        image: 'base64-image-bytes',
        safeProperty: 'allowed-public-data',
      },
    };

    const scrubbed = scrubAuditJson(rawData) as Record<string, unknown>;
    expect(scrubbed.password).toBe('[REDACTED]');
    expect(scrubbed.passwordHash).toBe('[REDACTED]');
    expect(scrubbed.token).toBe('[REDACTED]');
    expect(scrubbed.tokenHash).toBe('[REDACTED]');
    expect(scrubbed.cookie).toBe('[REDACTED]');

    const nested = scrubbed.nested as Record<string, unknown>;
    expect(nested.authorization).toBe('[REDACTED]');
    expect(nested.embedding).toBe('[REDACTED]');
    expect(nested.image).toBe('[REDACTED]');
    expect(nested.safeProperty).toBe('allowed-public-data');
  });
});


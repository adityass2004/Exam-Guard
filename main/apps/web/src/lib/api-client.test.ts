import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiClientError } from './api-client.js';

describe('apiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unwraps data envelope successfully', async () => {
    const mockData = { id: '123', status: 'ok' };
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue({ data: mockData }),
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const result = await apiClient<typeof mockData>('/api/test');
    expect(result).toEqual(mockData);
  });

  it('throws ApiClientError with server error details on failure', async () => {
    const errorEnvelope = {
      error: {
        code: 'NOT_FOUND',
        message: 'Student not found',
        requestId: 'req-abc-123',
      },
    };

    const mockResponse = {
      ok: false,
      status: 404,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue(errorEnvelope),
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    await expect(apiClient('/api/test')).rejects.toThrow('Student not found');

    try {
      await apiClient('/api/test');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiClientError);
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe('NOT_FOUND');
      expect(apiErr.statusCode).toBe(404);
      expect(apiErr.requestId).toBe('req-abc-123');
    }
  });

  it('handles network failure properly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));

    await expect(apiClient('/api/test')).rejects.toThrow(/Network or fetch failure/);
  });
});


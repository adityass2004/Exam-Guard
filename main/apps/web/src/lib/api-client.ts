import type { ApiError, ApiSuccess } from '@examguard/shared';

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(code: string, statusCode: number, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.requestId = requestId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  timeoutMs?: number;
}

let cachedCsrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  cachedCsrfToken = token;
}

export async function fetchCsrfToken(): Promise<string> {
  try {
    const res = await fetch('/api/v1/auth/csrf');
    if (res.ok) {
      const json = await res.json();
      if (json?.data?.csrfToken) {
        cachedCsrfToken = json.data.csrfToken;
        return json.data.csrfToken;
      }
    }
  } catch {
    // ignore network errors
  }
  return '';
}

export async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, signal, timeoutMs = 10000, ...rest } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const combinedSignal = signal || controller.signal;

  const requestHeaders = new Headers(headers);
  let requestBody: BodyInit | undefined;

  if (body !== undefined) {
    if (body instanceof FormData) {
      requestBody = body;
      // CRITICAL: Remove Content-Type header so browser automatically sets multipart/form-data with boundary
      requestHeaders.delete('Content-Type');
    } else {
      if (!requestHeaders.has('Content-Type')) {
        requestHeaders.set('Content-Type', 'application/json');
      }
      requestBody = typeof body === 'string' ? body : JSON.stringify(body);
    }
  }

  // Inject CSRF token if available for state-changing requests
  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes((rest.method || 'GET').toUpperCase());
  if (isStateChanging && !requestHeaders.has('X-CSRF-Token')) {
    if (!cachedCsrfToken) {
      await fetchCsrfToken();
    }
    if (cachedCsrfToken) {
      requestHeaders.set('X-CSRF-Token', cachedCsrfToken);
    }
  }

  try {
    const res = await fetch(endpoint, {
      ...rest,
      headers: requestHeaders,
      body: requestBody,
      signal: combinedSignal,
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const requestId = res.headers.get('x-request-id') || undefined;

    if (!res.ok) {
      if (isJson) {
        const errorJson = (await res.json()) as ApiError;
        const err = errorJson.error;
        throw new ApiClientError(
          err?.code || 'HTTP_ERROR',
          res.status,
          err?.message || `Request failed with status ${res.status}`,
          err?.details,
          err?.requestId || requestId,
        );
      }
      const rawText = await res.text();
      throw new ApiClientError(
        'HTTP_ERROR',
        res.status,
        rawText || `Request failed with status ${res.status}`,
        undefined,
        requestId,
      );
    }

    if (isJson) {
      const json = (await res.json()) as any;
      return json?.data !== undefined ? json.data : (json as unknown as T);
    }

    return (await res.text()) as unknown as T;
  } catch (err: unknown) {
    if (err instanceof ApiClientError) {
      throw err;
    }

    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiClientError('TIMEOUT', 408, `Request timed out after ${timeoutMs}ms`);
    }

    const message = err instanceof Error ? err.message : String(err);
    throw new ApiClientError('NETWORK_ERROR', 0, `Network or fetch failure: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface ApiResponseEnvelope<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    nextCursor?: string | null;
  };
}

async function requestWithEnvelope<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<ApiResponseEnvelope<T>> {
  const url = endpoint.startsWith('/api/')
    ? endpoint
    : `/api/v1${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const { body, headers, signal, timeoutMs = 10000, ...rest } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const combinedSignal = signal || controller.signal;

  const requestHeaders = new Headers(headers);
  let requestBody: BodyInit | undefined;

  if (body !== undefined) {
    if (body instanceof FormData) {
      requestBody = body;
      // CRITICAL: Remove Content-Type header so browser automatically sets multipart/form-data with boundary
      requestHeaders.delete('Content-Type');
    } else {
      if (!requestHeaders.has('Content-Type')) {
        requestHeaders.set('Content-Type', 'application/json');
      }
      requestBody = typeof body === 'string' ? body : JSON.stringify(body);
    }
  }

  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
    (rest.method || 'GET').toUpperCase(),
  );
  if (isStateChanging && !requestHeaders.has('X-CSRF-Token')) {
    if (!cachedCsrfToken) {
      await fetchCsrfToken();
    }
    if (cachedCsrfToken) {
      requestHeaders.set('X-CSRF-Token', cachedCsrfToken);
    }
  }

  try {
    const res = await fetch(url, {
      ...rest,
      headers: requestHeaders,
      body: requestBody,
      signal: combinedSignal,
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const requestId = res.headers.get('x-request-id') || undefined;

    if (!res.ok) {
      if (isJson) {
        const errorJson = (await res.json()) as ApiError;
        const err = errorJson.error;
        throw new ApiClientError(
          err?.code || 'HTTP_ERROR',
          res.status,
          err?.message || `Request failed with status ${res.status}`,
          err?.details,
          err?.requestId || requestId,
        );
      }
      const rawText = await res.text();
      throw new ApiClientError(
        'HTTP_ERROR',
        res.status,
        rawText || `Request failed with status ${res.status}`,
        undefined,
        requestId,
      );
    }

    if (isJson) {
      const json = (await res.json()) as any;
      return {
        data: json?.data !== undefined ? json.data : json,
        meta: json?.meta,
      };
    }

    return { data: (await res.text()) as unknown as T };
  } finally {
    clearTimeout(timeoutId);
  }
}

apiClient.get = <T>(endpoint: string, options?: RequestOptions) =>
  requestWithEnvelope<T>(endpoint, { ...options, method: 'GET' });

apiClient.post = <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
  requestWithEnvelope<T>(endpoint, { ...options, method: 'POST', body });

apiClient.put = <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
  requestWithEnvelope<T>(endpoint, { ...options, method: 'PUT', body });

apiClient.patch = <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
  requestWithEnvelope<T>(endpoint, { ...options, method: 'PATCH', body });

apiClient.delete = <T>(endpoint: string, options?: RequestOptions) =>
  requestWithEnvelope<T>(endpoint, { ...options, method: 'DELETE' });

export const api = apiClient;



import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientModule from '../../lib/api-client';
import SystemStatusPage from './page';

describe('SystemStatusPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading skeleton on initial mount', () => {
    vi.spyOn(apiClientModule, 'apiClient').mockImplementation(() => new Promise(() => {}));
    render(<SystemStatusPage />);
    expect(screen.getByText('System Status')).toBeInTheDocument();
  });

  it('renders status tiles when API call succeeds', async () => {
    const mockStatus = {
      api: 'UP',
      database: 'UP',
      vision: 'UP',
      version: '0.1.0',
      nodeEnv: 'test',
      calibrationStatus: 'PROVISIONAL',
      details: {
        databaseError: null,
        visionError: null,
        visionModelLoaded: true,
      },
      visionDetails: {
        versions: { python: '3.11.9', fastapi: '0.115.0' },
        executionProviders: ['CPUExecutionProvider'],
        modelState: 'READY',
        concurrency: { inFlight: 0, limit: 2 },
      },
      serverTime: new Date().toISOString(),
    };

    vi.spyOn(apiClientModule, 'apiClient').mockResolvedValue(mockStatus);

    render(<SystemStatusPage />);

    await waitFor(() => {
      expect(screen.getByText('Web App')).toBeInTheDocument();
      expect(screen.getByText('Node API')).toBeInTheDocument();
      expect(screen.getByText('Database')).toBeInTheDocument();
      expect(screen.getByText('Vision Service')).toBeInTheDocument();
      expect(screen.getAllByText('PROVISIONAL').length).toBeGreaterThan(0);
    });
  });

  it('renders error state when API call fails', async () => {
    vi.spyOn(apiClientModule, 'apiClient').mockRejectedValue(
      new apiClientModule.ApiClientError('NETWORK_ERROR', 0, 'Connection refused'),
    );

    render(<SystemStatusPage />);

    await waitFor(() => {
      expect(screen.getByText('API Service Unreachable')).toBeInTheDocument();
    });
  });
});


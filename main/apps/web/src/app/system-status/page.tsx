'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { SystemStatusResponseData } from '@examguard/shared';
import { apiClient, ApiClientError } from '../../lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/ErrorState';

export default function SystemStatusPage() {
  const [data, setData] = useState<SystemStatusResponseData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Reached same-origin via Next.js rewrite /api/* -> API_URL/api/*
      const result = await apiClient<SystemStatusResponseData>('/api/v1/system/status');
      setData(result);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        // Even if DB is down, API returns 503 with partial readiness data if handled
        if (err.statusCode === 503 && err.details) {
          setData(err.details as SystemStatusResponseData);
        } else {
          setError(err.message || 'API service unreachable');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to reach API server');
      }
      setLastChecked(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        {/* Navigation / Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-8 border-b border-slate-200 gap-4">
          <div>
            <Link
              href="/"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors mb-2 inline-block"
            >
              ← Back to Overview
            </Link>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">System Status</h1>
            <p className="text-sm text-slate-500 mt-1">
              Live status of ExamGuard processes, storage, and models.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {lastChecked && (
              <span className="text-xs text-slate-500">
                Last checked: <strong className="text-slate-700">{lastChecked}</strong>
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStatus}
              isLoading={loading}
              className="bg-white"
            >
              ↻ Re-check
            </Button>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mt-8">
            <ErrorState
              title="API Service Unreachable"
              message={`Could not connect to the API server through Next.js proxy rewrite (/api/v1/system/status): ${error}. Check if Node API process is running on port 4000.`}
              onRetry={fetchStatus}
            />
          </div>
        )}

        {/* Loading Skeletons */}
        {loading && !data && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="space-y-4">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-4 w-full" />
              </Card>
            ))}
          </div>
        )}

        {/* Status Tiles */}
        {data && (
          <div className="space-y-8 mt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Tile 1: Web */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Web App</CardTitle>
                    <StatusBadge status="UP" />
                  </div>
                  <CardDescription>Next.js App Router</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-slate-600">
                  <div>
                    Port: <span className="font-semibold text-slate-800">3000</span>
                  </div>
                  <div>
                    Rewrites: <span className="font-semibold text-slate-800">/api/* → 4000</span>
                  </div>
                  <div className="text-emerald-700 font-medium">✓ Client rendering active</div>
                </CardContent>
              </Card>

              {/* Tile 2: API */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Node API</CardTitle>
                    <StatusBadge status={data.api} />
                  </div>
                  <CardDescription>Express & Prisma Orchestrator</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-slate-600">
                  <div>
                    Port: <span className="font-semibold text-slate-800">4000</span>
                  </div>
                  <div>
                    Version: <span className="font-semibold text-slate-800">{data.version}</span>
                  </div>
                  <div>
                    Environment: <span className="font-semibold text-slate-800">{data.nodeEnv}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Tile 3: Database */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Database</CardTitle>
                    <StatusBadge status={data.database} />
                  </div>
                  <CardDescription>MySQL 8.x via Prisma</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-slate-600">
                  <div>
                    Port: <span className="font-semibold text-slate-800">3306</span>
                  </div>
                  {data.database === 'UP' ? (
                    <div className="text-emerald-700 font-medium">✓ Query check succeeded</div>
                  ) : (
                    <div className="text-rose-600 font-medium truncate" title={data.details?.databaseError || 'Unavailable'}>
                      ✕ {data.details?.databaseError || 'Connection failed'}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tile 4: Vision */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Vision Service</CardTitle>
                    <StatusBadge status={data.vision} />
                  </div>
                  <CardDescription>Python FastAPI & ArcFace</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-slate-600">
                  <div>
                    Port: <span className="font-semibold text-slate-800">8000</span>
                  </div>
                  <div>
                    Model State:{' '}
                    <span className="font-semibold text-slate-800">
                      {data.visionDetails?.modelState || (data.details?.visionModelLoaded ? 'READY' : 'DEGRADED')}
                    </span>
                  </div>
                  <div>
                    Calibration:{' '}
                    <span className="font-semibold text-amber-600">
                      {data.calibrationStatus}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Vision & Calibration Diagnostics */}
            <Card>
              <CardHeader>
                <CardTitle>Vision Subsystem & Model Details</CardTitle>
                <CardDescription>
                  Detailed diagnostic introspection received from Python FastAPI diagnostics endpoint
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.vision === 'DOWN' ? (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800">
                    <strong>Vision Service is Offline:</strong> The Node API was unable to connect to{' '}
                    <code>http://127.0.0.1:8000/v1/health</code> ({data.details?.visionError || 'Connection refused'}).
                    Start the vision service with <code>npm run dev:vision</code>.
                  </div>
                ) : (
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                        <h4 className="font-semibold text-slate-900 mb-2">Installed Python Versions</h4>
                        <div className="space-y-1 text-xs text-slate-600">
                          {data.visionDetails?.versions &&
                            Object.entries(data.visionDetails.versions).map(([k, v]) => (
                              <div key={k} className="flex justify-between border-b border-slate-100 py-0.5">
                                <span className="capitalize">{k}:</span>
                                <span className="font-mono font-medium text-slate-800">{v || 'not installed'}</span>
                              </div>
                            ))}
                        </div>
                      </div>

                      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                        <h4 className="font-semibold text-slate-900 mb-2">Model Execution & Hardware</h4>
                        <div className="space-y-2 text-xs text-slate-600">
                          <div>
                            Execution Providers:{' '}
                            <span className="font-mono font-medium text-slate-800">
                              {data.visionDetails?.executionProviders?.join(', ') || 'None reported'}
                            </span>
                          </div>
                          <div>
                            Concurrency:{' '}
                            <span className="font-medium text-slate-800">
                              {data.visionDetails?.concurrency?.inFlight ?? 0} in flight (max {data.visionDetails?.concurrency?.limit ?? 2})
                            </span>
                          </div>
                          <div>
                            Calibration Status:{' '}
                            <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[11px]">
                              {data.calibrationStatus}
                            </span>
                            <p className="mt-1 text-[11px] text-slate-500">
                              Display scores are mapped using provisional parameters until calibrated on owner data in Prompt 09.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}


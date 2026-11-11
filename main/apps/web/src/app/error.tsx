'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { ErrorState } from '../components/ui/ErrorState';
import { Button } from '../components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console
    console.error('Unhandled Next.js application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <ErrorState
          title="Application Encountered An Error"
          message={error.message || 'An unexpected client error occurred.'}
          onRetry={reset}
        />
        <div className="mt-4 text-center">
          <Link href="/">
            <Button variant="ghost" size="sm">
              ← Return Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}


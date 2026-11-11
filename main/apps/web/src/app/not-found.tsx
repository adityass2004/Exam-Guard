import React from 'react';
import Link from 'next/link';
import { Button } from '../components/ui/Button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
      <div className="max-w-md w-full">
        <h1 className="text-6xl font-black text-slate-300 mb-2">404</h1>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Page Not Found</h2>
        <p className="text-sm text-slate-500 mb-6">
          The requested page could not be located on the ExamGuard server.
        </p>
        <Link href="/">
          <Button variant="primary">
            Return to Overview
          </Button>
        </Link>
      </div>
    </div>
  );
}


import React from 'react';
import { Spinner } from '../components/ui/Spinner';

export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <Spinner size="lg" className="mb-4" />
      <p className="text-sm font-medium text-slate-500 animate-pulse">
        Loading ExamGuard interface...
      </p>
    </div>
  );
}


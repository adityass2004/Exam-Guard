'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { StudentShell } from '../../components/StudentShell';
import { Spinner } from '../../components/ui/Spinner';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <Spinner size="lg" className="mb-4" />
        <p className="text-sm font-medium text-slate-500 animate-pulse">
          Validating authentication session...
        </p>
      </div>
    );
  }

  if (!user || user.role !== 'STUDENT') {
    return null;
  }

  return (
    <StudentShell user={user} onLogout={logout}>
      {children}
    </StudentShell>
  );
}


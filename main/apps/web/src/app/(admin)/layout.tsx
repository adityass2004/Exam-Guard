'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { AdminShell } from '../../components/AdminShell';
import { Spinner } from '../../components/ui/Spinner';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/admin/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center text-white">
        <Spinner size="lg" className="mb-4 text-blue-500 border-blue-500 border-t-transparent" />
        <p className="text-sm font-medium text-slate-400 animate-pulse">
          Validating administrator privileges...
        </p>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  return (
    <AdminShell user={user} onLogout={logout}>
      {children}
    </AdminShell>
  );
}


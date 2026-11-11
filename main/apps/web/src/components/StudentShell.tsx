'use client';

import React from 'react';
import Link from 'next/link';
import type { AuthUserDto } from '@examguard/shared';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

export function StudentShell({
  user,
  onLogout,
  children,
}: {
  user: AuthUserDto;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-xl font-bold text-slate-900 tracking-tight">
                Exam<span className="text-blue-600">Guard</span>
              </span>
              <Badge variant="default" className="text-[10px]">
                Student
              </Badge>
            </Link>

            <nav className="hidden md:flex items-center gap-4 text-sm font-medium text-slate-600">
              <Link
                href="/dashboard"
                className="text-blue-600 font-semibold transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/system-status"
                className="hover:text-slate-900 transition-colors"
              >
                System Status
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-slate-800">{user.fullName}</div>
              <div className="text-xs text-slate-500 font-mono">
                ID: {user.studentId || 'N/A'}
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={onLogout}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        ExamGuard Student Portal · Automated detection indicates a possible discrepancy and is not proof of misconduct.
      </footer>
    </div>
  );
}


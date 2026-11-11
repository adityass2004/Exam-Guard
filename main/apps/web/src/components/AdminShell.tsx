'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AuthUserDto } from '@examguard/shared';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

export function AdminShell({
  user,
  onLogout,
  children,
}: {
  user: AuthUserDto;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: 'Dashboard', href: '/admin/dashboard', icon: '📊' },
    { label: 'Live Monitoring', href: '/admin/monitoring', icon: '📡' },
    { label: 'Security Incidents', href: '/admin/incidents', icon: '🚨' },
    { label: 'Verification History', href: '/admin/verifications', icon: '🔍' },
    { label: 'Reports & Analytics', href: '/admin/reports', icon: '📈' },
    { label: 'Exams', href: '/admin/exams', icon: '📝' },
    { label: 'Students', href: '/admin/students', icon: '🎓' },
    { label: 'Face Gallery', href: '/admin/gallery', icon: '👤' },
    { label: 'Enrollments', href: '/admin/enrollments', icon: '📷' },
    { label: 'Audit Logs', href: '/admin/audit', icon: '📋' },
    { label: 'Verification Settings', href: '/admin/settings/verification', icon: '⚙️' },
    { label: 'System & Retention', href: '/admin/settings/system', icon: '🛡️' },
    { label: 'Admins', href: '/admin/admins', icon: '👥' },
    { label: 'System Status', href: '/system-status', icon: '🩺' },
  ];

  const isActive = (href: string) => {
    if (href === '/admin/dashboard') {
      return pathname === '/admin/dashboard' || pathname === '/admin';
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between hidden md:flex border-r border-slate-800">
        <div>
          <div className="p-6 border-b border-slate-800">
            <Link href="/admin/dashboard" className="flex items-center gap-2">
              <span className="text-xl font-bold text-white tracking-tight">
                Exam<span className="text-blue-500">Guard</span>
              </span>
              <Badge variant="default" className="text-[10px] bg-blue-900 text-blue-200 border-blue-700">
                Admin
              </Badge>
            </Link>
          </div>

          <nav className="p-4 space-y-1 text-sm font-medium">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    active
                      ? 'bg-blue-600 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="mb-3 px-2">
            <div className="text-sm font-semibold text-white truncate">{user.fullName}</div>
            <div className="text-xs text-slate-400 truncate">{user.email}</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className="w-full justify-center bg-transparent text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white"
          >
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between">
          <Link href="/admin/dashboard" className="text-lg font-bold text-slate-900">
            Exam<span className="text-blue-600">Guard</span> Admin
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="px-2.5"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </Button>
            <Button variant="outline" size="sm" onClick={onLogout}>
              Sign Out
            </Button>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-slate-900 text-white p-4 border-b border-slate-800 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                  isActive(item.href) ? 'bg-blue-600 font-semibold' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        )}

        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white py-4 px-8 text-center md:text-left text-xs text-slate-400">
          ExamGuard Administrator Management Console · Phase 4
        </footer>
      </div>
    </div>
  );
}

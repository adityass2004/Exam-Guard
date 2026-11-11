'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../components/ui/Toast';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';

export default function StudentLoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsLoading(true);

    try {
      await login({ email, password });
      toast('Welcome back! Signed in successfully.', 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid credentials';
      setFormError(message);
      toast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-block mb-4">
          <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Exam<span className="text-blue-600">Guard</span>
          </span>
        </Link>
        <h2 className="text-xl font-bold text-slate-900">Student Portal Login</h2>
        <p className="mt-1 text-sm text-slate-500">
          Sign in to access your examinations and face verification profile
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        {/* Unauthenticated Testing Sandbox CTA */}
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 font-bold text-xs text-blue-950">
              <span className="text-base">🧪</span> Live Biometric Testing Sandbox
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Record reference faces and test real-time proctoring detections on a separate database (No login required).
            </p>
          </div>
          <Link href="/sandbox">
            <Button size="sm" className="whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm">
              Open Testing Sandbox →
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your student account credentials below</CardDescription>
          </CardHeader>
          <CardContent>
            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@examguard.local"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <Button type="submit" variant="primary" isLoading={isLoading} className="w-full justify-center">
                Sign In
              </Button>
            </form>

            <div className="mt-6 text-center text-xs text-slate-500 border-t border-slate-100 pt-4">
              Don&apos;t have an account yet?{' '}
              <Link href="/register" className="font-semibold text-blue-600 hover:text-blue-800">
                Register as a Student
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-xs text-slate-400">
          <Link href="/admin/login" className="hover:text-slate-600">
            Administrator login →
          </Link>
        </div>
      </div>
    </div>
  );
}


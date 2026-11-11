'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../hooks/useAuth';
import { useToast } from '../../../../components/ui/Toast';
import { Button } from '../../../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/Card';

export default function AdminLoginPage() {
  const { adminLogin } = useAuth();
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
      await adminLogin({ email, password });
      toast('Welcome to Administrator Console.', 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid credentials';
      setFormError(message);
      toast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-block mb-4">
          <span className="text-3xl font-extrabold text-white tracking-tight">
            Exam<span className="text-blue-500">Guard</span>
          </span>
        </Link>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-900/60 border border-blue-700 text-blue-200 text-xs font-semibold mb-2">
          Administrator Management Console
        </div>
        <h2 className="text-xl font-bold text-white">Administrative Access</h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Card className="bg-slate-800 border-slate-700 text-white">
          <CardHeader>
            <CardTitle className="text-white">Admin Sign In</CardTitle>
            <CardDescription className="text-slate-400">
              Only authorized proctors and administrative accounts may sign in here
            </CardDescription>
          </CardHeader>
          <CardContent>
            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-xs text-rose-300 font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Administrator Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@examguard.local"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Master Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <Button type="submit" variant="primary" isLoading={isLoading} className="w-full justify-center bg-blue-600 hover:bg-blue-700">
                Authenticate as Admin
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-xs text-slate-500">
          <Link href="/login" className="hover:text-slate-400">
            ← Return to student login
          </Link>
        </div>
      </div>
    </div>
  );
}


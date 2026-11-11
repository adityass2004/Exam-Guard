'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '../../../../../lib/api-client';
import { ExamForm } from '../../../../../components/admin/ExamForm';
import { CreateExamInput } from '@examguard/shared';

export default function NewExamPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (values: CreateExamInput) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiClient.post<{ id: string }>('/admin/exams', values);
      router.push(`/admin/exams/${res.data.id}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to create examination');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/exams" className="text-slate-400 hover:text-slate-600 text-sm font-semibold">
          ← Back to Exams
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create Examination</h1>
        <p className="text-sm text-slate-500 mt-1">
          Set up basic examination details. You will be able to add questions immediately after creation.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      <ExamForm onSubmit={handleCreate} submitLabel="Create and Add Questions" isSubmitting={submitting} />
    </div>
  );
}


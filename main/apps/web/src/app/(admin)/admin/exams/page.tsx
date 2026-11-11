'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../../lib/api-client';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { SearchInput } from '../../../../components/ui/SearchInput';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { Pagination } from '../../../../components/ui/Pagination';

interface ExamItem {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  questionCount: number;
  sessionCount: number;
  createdAt: string;
}

export default function AdminExamsPage() {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [confirmAction, setConfirmAction] = useState<{
    type: 'activate' | 'deactivate' | 'delete';
    exam: ExamItem;
  } | null>(null);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      query.set('page', String(page));
      query.set('limit', String(limit));
      if (search.trim()) query.set('search', search.trim());
      if (statusFilter) query.set('status', statusFilter);

      const res = await apiClient.get<ExamItem[]>(`/admin/exams?${query.toString()}`);
      setExams(res.data);
      if (res.meta?.total !== undefined) {
        setTotal(res.meta.total);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch examinations');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, exam } = confirmAction;

    try {
      if (type === 'activate') {
        await apiClient.post(`/admin/exams/${exam.id}/activate`);
      } else if (type === 'deactivate') {
        await apiClient.post(`/admin/exams/${exam.id}/deactivate`);
      } else if (type === 'delete') {
        await apiClient.delete(`/admin/exams/${exam.id}`);
      }
      setConfirmAction(null);
      await fetchExams();
    } catch (err: any) {
      setError(err?.message || `Failed to ${type} exam`);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">Active</Badge>;
      case 'DRAFT':
        return <Badge variant="warning">Draft</Badge>;
      case 'INACTIVE':
        return <Badge variant="default" className="bg-slate-200 text-slate-700">Inactive</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Examinations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage test curriculum, MCQs, activation lifecycle, and proctoring parameters
          </p>
        </div>
        <Link href="/admin/exams/new">
          <Button className="flex items-center gap-1.5">
            <span>+</span> Create New Exam
          </Button>
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-bold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="w-full sm:w-72">
          <SearchInput
            placeholder="Search by title..."
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading examinations...</div>
        ) : exams.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No exams found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Title</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Duration</th>
                  <th className="px-4 py-3.5">Questions</th>
                  <th className="px-4 py-3.5">Sessions</th>
                  <th className="px-4 py-3.5">Created</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exams.map((exam) => (
                  <tr key={exam.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      <Link href={`/admin/exams/${exam.id}`} className="hover:text-blue-600 hover:underline">
                        {exam.title}
                      </Link>
                      {exam.description && (
                        <p className="text-xs text-slate-400 font-normal line-clamp-1 mt-0.5">
                          {exam.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">{getStatusBadge(exam.status)}</td>
                    <td className="px-4 py-4 text-slate-600">{exam.durationMinutes} mins</td>
                    <td className="px-4 py-4 font-medium text-slate-700">{exam.questionCount}</td>
                    <td className="px-4 py-4 font-medium text-slate-700">{exam.sessionCount}</td>
                    <td className="px-4 py-4 text-xs text-slate-400">
                      {new Date(exam.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/admin/exams/${exam.id}`}>
                          <Button variant="outline" size="sm">
                            View / Edit
                          </Button>
                        </Link>
                        {exam.status === 'ACTIVE' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-amber-600 hover:text-amber-800"
                            onClick={() => setConfirmAction({ type: 'deactivate', exam })}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-600 hover:text-emerald-800"
                            onClick={() => setConfirmAction({ type: 'activate', exam })}
                          >
                            Activate
                          </Button>
                        )}
                        {exam.sessionCount === 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => setConfirmAction({ type: 'delete', exam })}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-4 border-t border-slate-100 flex justify-between items-center">
          <span className="text-xs text-slate-500">
            Showing {exams.length} of {total} examinations
          </span>
          <Pagination
            page={page}
            totalPages={Math.ceil(total / limit) || 1}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmAction}
        title={
          confirmAction?.type === 'activate'
            ? 'Activate Examination'
            : confirmAction?.type === 'deactivate'
            ? 'Deactivate Examination'
            : 'Delete Examination'
        }
        message={
          confirmAction?.type === 'activate'
            ? `Are you sure you want to activate "${confirmAction.exam.title}"? Candidates with approved biometric enrollments will immediately be able to take this exam.`
            : confirmAction?.type === 'deactivate'
            ? `Deactivating "${confirmAction?.exam.title}" will prevent any new sessions from being started. In-progress sessions will finish normally.`
            : `Are you sure you want to delete "${confirmAction?.exam.title}"? This soft-deletes the exam.`
        }
        confirmLabel={
          confirmAction?.type === 'activate'
            ? 'Activate Exam'
            : confirmAction?.type === 'deactivate'
            ? 'Deactivate Exam'
            : 'Delete Exam'
        }
      />
    </div>
  );
}

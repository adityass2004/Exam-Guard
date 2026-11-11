'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { StudentListItemDto } from '@examguard/shared';
import { apiClient } from '../../../../lib/api-client';
import { FilterBar } from '../../../../components/admin/FilterBar';
import { StudentTable } from '../../../../components/admin/StudentTable';
import { Pagination } from '../../../../components/ui/Pagination';

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<StudentListItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [enrollmentStatus, setEnrollmentStatus] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (search.trim()) params.set('search', search.trim());
      if (enrollmentStatus) params.set('enrollmentStatus', enrollmentStatus);
      if (status) params.set('status', status);

      const res = await apiClient.get<StudentListItemDto[]>(`/admin/students?${params.toString()}`);
      if (res.data) {
        setStudents(res.data);
      }
      if (res.meta) {
        setTotal(res.meta.total || 0);
        setTotalPages(res.meta.totalPages || 1);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [page, search, enrollmentStatus, status]);

  const handleResetFilters = () => {
    setSearch('');
    setEnrollmentStatus('');
    setStatus('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Student Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Search candidates, review enrollment statuses, and manage account credentials.
          </p>
        </div>

        <Link
          href="/admin/gallery"
          className="inline-flex items-center text-xs font-semibold px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
        >
          👤 Open Candidate Face Gallery →
        </Link>
      </div>

      {/* Filter Bar */}
      <FilterBar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Search by student name, email, or student ID..."
        filters={[
          {
            id: 'enrollmentStatus',
            label: 'Enrollment Status',
            value: enrollmentStatus,
            options: [
              { label: 'All Enrollment States', value: '' },
              { label: 'Pending Approval', value: 'PENDING_APPROVAL' },
              { label: 'Approved', value: 'APPROVED' },
              { label: 'Rejected', value: 'REJECTED' },
              { label: 'Revoked', value: 'REVOKED' },
              { label: 'Draft', value: 'DRAFT' },
              { label: 'Not Started', value: 'NOT_STARTED' },
            ],
            onChange: (val) => {
              setEnrollmentStatus(val);
              setPage(1);
            },
          },
          {
            id: 'accountStatus',
            label: 'Account Status',
            value: status,
            options: [
              { label: 'All Account States', value: '' },
              { label: 'Active Accounts', value: 'ACTIVE' },
              { label: 'Suspended Accounts', value: 'SUSPENDED' },
            ],
            onChange: (val) => {
              setStatus(val);
              setPage(1);
            },
          },
        ]}
        onReset={search || enrollmentStatus || status ? handleResetFilters : undefined}
      />

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          {error}
        </div>
      )}

      {/* Student Table */}
      <StudentTable students={students} loading={loading} />

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={(p) => setPage(p)}
        disabled={loading}
      />
    </div>
  );
}

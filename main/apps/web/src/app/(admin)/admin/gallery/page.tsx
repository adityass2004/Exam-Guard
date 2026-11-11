'use client';

import React, { useEffect, useState } from 'react';
import type { CandidateGalleryItemDto } from '@examguard/shared';
import { apiClient } from '../../../../lib/api-client';
import { FaceGalleryGrid } from '../../../../components/admin/FaceGalleryGrid';
import { FilterBar } from '../../../../components/admin/FilterBar';
import { Pagination } from '../../../../components/ui/Pagination';

export default function AdminFaceGalleryPage() {
  const [candidates, setCandidates] = useState<CandidateGalleryItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit] = useState(24);
  const [search, setSearch] = useState('');
  const [enrollmentStatus, setEnrollmentStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (search.trim()) params.set('search', search.trim());
      if (enrollmentStatus) params.set('enrollmentStatus', enrollmentStatus);

      const res = await apiClient.get<CandidateGalleryItemDto[]>(
        `/admin/gallery/candidates?${params.toString()}`,
      );
      if (res.data) {
        setCandidates(res.data);
      }
      if (res.meta) {
        setTotal(res.meta.total || 0);
        setTotalPages(res.meta.totalPages || 1);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load face gallery candidates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, [page, search, enrollmentStatus]);

  const handleResetFilters = () => {
    setSearch('');
    setEnrollmentStatus('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Candidate Face Gallery
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Registered candidate photographs with secure encrypted streaming and multi-angle audit history.
        </p>
      </div>

      {/* Filter Bar */}
      <FilterBar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Search candidate by name, student ID, or email..."
        filters={[
          {
            id: 'enrollmentStatus',
            label: 'Enrollment Status',
            value: enrollmentStatus,
            options: [
              { label: 'All Candidates', value: '' },
              { label: 'Pending Approval', value: 'PENDING_APPROVAL' },
              { label: 'Approved', value: 'APPROVED' },
              { label: 'Rejected', value: 'REJECTED' },
              { label: 'Revoked', value: 'REVOKED' },
              { label: 'Drafting', value: 'DRAFT' },
              { label: 'Not Started', value: 'NOT_STARTED' },
            ],
            onChange: (val) => {
              setEnrollmentStatus(val);
              setPage(1);
            },
          },
        ]}
        onReset={search || enrollmentStatus ? handleResetFilters : undefined}
      />

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          {error}
        </div>
      )}

      {/* Grid */}
      <FaceGalleryGrid candidates={candidates} loading={loading} />

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

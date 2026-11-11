'use client';

import React from 'react';
import Link from 'next/link';
import type { CandidateGalleryItemDto } from '@examguard/shared';
import { Badge } from '../ui/Badge';
import { Card, CardContent } from '../ui/Card';

export interface FaceGalleryGridProps {
  candidates: CandidateGalleryItemDto[];
  loading?: boolean;
}

export function FaceGalleryGrid({ candidates, loading = false }: FaceGalleryGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-slate-200 p-4 aspect-[3/4] animate-pulse flex flex-col justify-between"
          >
            <div className="w-full aspect-[4/3] bg-slate-200 rounded-lg" />
            <div className="space-y-2 mt-4">
              <div className="h-4 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
        <span className="text-3xl mb-2 block">📷</span>
        <h3 className="text-base font-semibold text-slate-800">No candidates found</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          No candidates match the selected search or status filters.
        </p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Badge variant="success">Approved</Badge>;
      case 'PENDING_APPROVAL':
        return <Badge variant="warning">Pending Approval</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">Rejected</Badge>;
      case 'REVOKED':
        return <Badge variant="danger">Revoked</Badge>;
      case 'DRAFT':
        return <Badge variant="default">Drafting</Badge>;
      default:
        return <Badge variant="default">Not Started</Badge>;
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {candidates.map((candidate) => (
        <Link
          key={candidate.studentUserId}
          href={`/admin/students/${candidate.studentUserId}`}
          className="group block"
        >
          <Card className="overflow-hidden hover:border-blue-400 hover:shadow-md transition-all">
            {/* Front Photo Preview */}
            <div className="relative aspect-[4/3] bg-slate-900 overflow-hidden flex items-center justify-center">
              {candidate.frontImageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={candidate.frontImageUrl}
                  alt={`Candidate ${candidate.fullName}`}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 select-none"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-4 text-center text-slate-500">
                  <span className="text-2xl mb-1">👤</span>
                  <span className="text-xs">No Photo Enrolled</span>
                </div>
              )}

              {/* Status pill overlay */}
              <div className="absolute top-2 right-2">
                {getStatusBadge(candidate.enrollmentStatus)}
              </div>
            </div>

            <CardContent className="p-4 space-y-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                  {candidate.fullName}
                </h4>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                  <span>ID: {candidate.studentId}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  {candidate.submittedAt
                    ? `Enrolled: ${new Date(candidate.submittedAt).toLocaleDateString()}`
                    : 'Enrollment pending'}
                </span>
                <span className="text-blue-600 font-medium group-hover:translate-x-0.5 transition-transform">
                  View →
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

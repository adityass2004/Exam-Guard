'use client';

import React from 'react';
import { Button } from './Button';

export interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (newPage: number) => void;
  disabled?: boolean;
}

export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  disabled = false,
}: PaginationProps) {
  if (totalPages <= 1 && (total === undefined || total === 0)) {
    return null;
  }

  return (
    <div className="flex items-center justify-between px-2 py-3">
      {total !== undefined && (
        <p className="text-xs text-slate-500">
          Showing page <span className="font-semibold text-slate-700">{page}</span> of{' '}
          <span className="font-semibold text-slate-700">{Math.max(totalPages, 1)}</span> ({total}{' '}
          total)
        </p>
      )}
      <div className="flex items-center gap-2 ml-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || disabled}
        >
          Previous
        </Button>
        <span className="text-xs font-medium text-slate-600 px-2">
          {page} / {Math.max(totalPages, 1)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || disabled}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { SearchInput } from '../ui/SearchInput';
import { Button } from '../ui/Button';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterBarProps {
  searchValue: string;
  onSearchChange: (val: string) => void;
  searchPlaceholder?: string;
  filters?: {
    id: string;
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (val: string) => void;
  }[];
  onReset?: () => void;
  children?: React.ReactNode;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [],
  onReset,
  children,
}: FilterBarProps) {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-4 sm:flex-wrap">
      <div className="flex-1 min-w-[200px]">
        <SearchInput
          value={searchValue}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
        />
      </div>

      {filters.map((f) => (
        <div key={f.id} className="min-w-[140px]">
          <select
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={f.label}
          >
            {f.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="text-xs text-slate-500">
          Reset filters
        </Button>
      )}

      {children && <div className="sm:ml-auto">{children}</div>}
    </div>
  );
}

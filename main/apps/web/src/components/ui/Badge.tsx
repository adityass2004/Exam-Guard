import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'neutral';
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-blue-100 text-blue-800 border-blue-200',
    success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-100 text-amber-800 border-amber-200',
    danger: 'bg-rose-100 text-rose-800 border-rose-200',
    neutral: 'bg-slate-100 text-slate-800 border-slate-200',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors',
          variants[variant],
          className,
        ),
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: 'UP' | 'DEGRADED' | 'DOWN' | string }) {
  if (status === 'UP' || status === 'OK' || status === 'READY') {
    return (
      <Badge variant="success">
        <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
        {status}
      </Badge>
    );
  }

  if (status === 'DEGRADED' || status === 'LOADING' || status === 'PROVISIONAL') {
    return (
      <Badge variant="warning">
        <span className="mr-1.5 h-2 w-2 rounded-full bg-amber-500 inline-block"></span>
        {status}
      </Badge>
    );
  }

  return (
    <Badge variant="danger">
      <span className="mr-1.5 h-2 w-2 rounded-full bg-rose-500 inline-block"></span>
      {status}
    </Badge>
  );
}


import React from 'react';
import { Card, CardContent } from '../ui/Card';

export interface StatCardProps {
  title: string;
  value: number | string;
  description?: string;
  icon?: string;
  color?: 'default' | 'blue' | 'amber' | 'emerald' | 'rose' | 'purple';
}

export function StatCard({
  title,
  value,
  description,
  icon,
  color = 'default',
}: StatCardProps) {
  const colorStyles = {
    default: 'text-slate-900',
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
    purple: 'text-purple-600',
  }[color];

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {title}
          </span>
          {icon && <span className="text-lg opacity-80">{icon}</span>}
        </div>
        <div className={`mt-2 text-2xl font-bold tracking-tight ${colorStyles}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {description && (
          <p className="mt-1 text-xs text-slate-500 line-clamp-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

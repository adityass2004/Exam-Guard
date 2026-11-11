'use client';

import React, { useState, useEffect } from 'react';
import { CreateExamInput, createExamSchema, VerificationSettingsDto } from '@examguard/shared';
import { Button } from '../ui/Button';
import { apiClient } from '../../lib/api-client';

export interface ExamFormProps {
  initialValues?: Partial<CreateExamInput>;
  onSubmit: (values: CreateExamInput) => Promise<void>;
  submitLabel?: string;
  isSubmitting?: boolean;
}

export function ExamForm({
  initialValues,
  onSubmit,
  submitLabel = 'Save Exam',
  isSubmitting = false,
}: ExamFormProps) {
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [durationMinutes, setDurationMinutes] = useState(initialValues?.durationMinutes ?? 60);
  const [shuffleQuestions, setShuffleQuestions] = useState(initialValues?.shuffleQuestions ?? false);
  const [showScoreAfterSubmit, setShowScoreAfterSubmit] = useState(initialValues?.showScoreAfterSubmit ?? true);
  const [verificationSettingsId, setVerificationSettingsId] = useState<string>(
    initialValues?.verificationSettingsId ?? ''
  );
  const [availableSettings, setAvailableSettings] = useState<VerificationSettingsDto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    apiClient
      .get<{ history: VerificationSettingsDto[] }>('/admin/verification-settings/history')
      .then((res) => {
        if (res.data?.history) {
          setAvailableSettings(res.data.history);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = createExamSchema.safeParse({
      title,
      description: description.trim() ? description : null,
      durationMinutes: Number(durationMinutes),
      shuffleQuestions,
      showScoreAfterSubmit,
      verificationSettingsId: verificationSettingsId ? verificationSettingsId : null,
    });

    if (!result.success) {
      const errMap: Record<string, string> = {};
      for (const issue of result.error.issues) {
        errMap[issue.path[0] as string] = issue.message;
      }
      setErrors(errMap);
      return;
    }

    await onSubmit(result.data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Exam Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Distributed Systems Midterm"
          className="w-full px-3 py-2 border rounded-lg text-sm border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Description (Optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Detailed syllabus, instructions, or rules for examinees"
          className="w-full px-3 py-2 border rounded-lg text-sm border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Duration (Minutes) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={1}
            max={600}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full px-3 py-2 border rounded-lg text-sm border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.durationMinutes && <p className="text-red-500 text-xs mt-1">{errors.durationMinutes}</p>}
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-slate-100">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={shuffleQuestions}
            onChange={(e) => setShuffleQuestions(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 font-medium">
            Shuffle questions per candidate (deterministic session ordering)
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showScoreAfterSubmit}
            onChange={(e) => setShowScoreAfterSubmit(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 font-medium">
            Display final score and summary immediately upon submission
          </span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Verification Configuration Override (Optional)
        </label>
        <select
          value={verificationSettingsId}
          onChange={(e) => setVerificationSettingsId(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Default (Use System-wide Active Profile)</option>
          {availableSettings.map((s) => (
            <option key={s.id} value={s.id}>
              v{s.version} {s.name ? `- ${s.name}` : ''} (Threshold: {s.thresholdPct.toFixed(1)}%, {s.intervalMs}ms)
              {s.isActive ? ' [Active]' : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400 mt-1">
          Pin this examination to a specific verification configuration version, or leave as Default.
        </p>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}


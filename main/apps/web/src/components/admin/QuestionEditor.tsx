'use client';

import React, { useState } from 'react';
import { CreateQuestionInput, QuestionOptionInput, createQuestionSchema } from '@examguard/shared';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';

export interface QuestionViewItem {
  id: string;
  position: number;
  prompt: string;
  points: number;
  options: Array<{
    id: string;
    position: number;
    label: string;
    isCorrect: boolean;
  }>;
}

export interface QuestionEditorProps {
  examId: string;
  questions: QuestionViewItem[];
  hasSessions: boolean;
  onAddQuestion: (q: CreateQuestionInput) => Promise<void>;
  onUpdateQuestion: (questionId: string, q: CreateQuestionInput) => Promise<void>;
  onDeleteQuestion: (questionId: string) => Promise<void>;
  onReorderQuestions: (questionIds: string[]) => Promise<void>;
}

export function QuestionEditor({
  examId,
  questions,
  hasSessions,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onReorderQuestions,
}: QuestionEditorProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionViewItem | null>(null);
  const [promptText, setPromptText] = useState('');
  const [points, setPoints] = useState(1);
  const [options, setOptions] = useState<QuestionOptionInput[]>([
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingQuestion(null);
    setPromptText('');
    setPoints(1);
    setOptions([
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ]);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (q: QuestionViewItem) => {
    setEditingQuestion(q);
    setPromptText(q.prompt);
    setPoints(q.points);
    setOptions(
      q.options.map((o) => ({
        id: o.id,
        text: o.label,
        isCorrect: o.isCorrect,
      }))
    );
    setFormError(null);
    setModalOpen(true);
  };

  const handleAddOption = () => {
    if (options.length >= 6) return;
    setOptions([...options, { text: '', isCorrect: false }]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    const newOpts = options.filter((_, idx) => idx !== index);
    // If we removed the correct option, default first option to correct
    if (options[index].isCorrect && newOpts.length > 0) {
      newOpts[0].isCorrect = true;
    }
    setOptions(newOpts);
  };

  const handleSelectCorrect = (index: number) => {
    setOptions(
      options.map((opt, idx) => ({
        ...opt,
        isCorrect: idx === index,
      }))
    );
  };

  const handleOptionTextChange = (index: number, val: string) => {
    const updated = [...options];
    updated[index].text = val;
    setOptions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanOptions = options.map((o) => ({
      ...o,
      text: o.text.trim(),
    }));

    const result = createQuestionSchema.safeParse({
      text: promptText.trim(),
      points: Number(points),
      options: cleanOptions,
    });

    if (!result.success) {
      setFormError(result.error.issues[0].message);
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingQuestion) {
        await onUpdateQuestion(editingQuestion.id, result.data);
      } else {
        await onAddQuestion(result.data);
      }
      setModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save question');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= questions.length) return;

    const ids = questions.map((q) => q.id);
    const temp = ids[index];
    ids[index] = ids[newIdx];
    ids[newIdx] = temp;

    await onReorderQuestions(ids);
  };

  return (
    <div className="space-y-4">
      {hasSessions && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-800 text-sm">
          <span className="text-xl">⚠️</span>
          <div>
            <strong className="font-semibold">Questions Locked:</strong> This exam has active or completed candidate sessions. Question modifications are permanently locked to preserve examination integrity.
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="text-base font-bold text-slate-800">
          Examination Questions ({questions.length})
        </h3>
        {!hasSessions && (
          <Button onClick={openCreateModal} size="sm" className="flex items-center gap-1.5">
            <span>+</span> Add Question
          </Button>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="p-8 text-center bg-white border border-dashed border-slate-300 rounded-xl text-slate-500 text-sm">
          No questions added yet. Add at least one question to activate this exam.
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between gap-4"
            >
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Question #{q.position}
                  </span>
                  <Badge variant="default" className="text-[10px] bg-slate-100 text-slate-700">
                    {q.points} {q.points === 1 ? 'Point' : 'Points'}
                  </Badge>
                </div>
                <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap">{q.prompt}</p>

                <div className="space-y-1.5 pt-1">
                  {q.options.map((opt) => (
                    <div
                      key={opt.id}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center justify-between ${
                        opt.isCorrect
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {opt.isCorrect && (
                        <span className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">
                          Correct Choice
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {!hasSessions && (
                <div className="flex md:flex-col items-end justify-between gap-2 border-t md:border-t-0 md:border-l md:pl-4 pt-3 md:pt-0 border-slate-100">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0}
                      title="Move Question Up"
                    >
                      ▲
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === questions.length - 1}
                      title="Move Question Down"
                    >
                      ▼
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditModal(q)}>
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteConfirmId(q.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Question Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingQuestion ? 'Edit Question' : 'Add Question'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Question Prompt <span className="text-red-500">*</span>
            </label>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={3}
              placeholder="e.g. Which layer of the OSI model handles end-to-end reliability?"
              className="w-full px-3 py-2 border rounded-lg text-sm border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Score Points
            </label>
            <input
              type="number"
              min={1}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="w-24 px-3 py-1.5 border rounded-lg text-sm border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Options (2–6) · Select Exactly One Correct
              </label>
              {options.length < 6 && (
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                >
                  + Add Choice
                </button>
              )}
            </div>

            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correctOptionSelector"
                  checked={opt.isCorrect}
                  onChange={() => handleSelectCorrect(idx)}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                  title="Mark as correct choice"
                />
                <input
                  type="text"
                  value={opt.text}
                  onChange={(e) => handleOptionTextChange(idx, e.target.value)}
                  placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                  className={`flex-1 px-3 py-1.5 border rounded-lg text-sm ${
                    opt.isCorrect ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-300'
                  }`}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(idx)}
                    className="text-slate-400 hover:text-red-500 text-sm px-1"
                    title="Remove Choice"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button variant="ghost" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingQuestion ? 'Update Question' : 'Add Question'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteConfirmId)}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={async () => {
          if (deleteConfirmId) {
            await onDeleteQuestion(deleteConfirmId);
            setDeleteConfirmId(null);
          }
        }}
        title="Delete Question"
        message="Are you sure you want to permanently delete this question? Remaining questions will be renumbered contiguously."
        confirmLabel="Delete Question"
      />
    </div>
  );
}

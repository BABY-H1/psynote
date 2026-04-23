import React from 'react';
import { Filter } from 'lucide-react';
import { useAssessments, useBatches } from '../../../api/useAssessments';
import type { TriageMode } from '../../../api/useResearchTriage';

const MODES: { key: TriageMode; label: string; hint: string }[] = [
  { key: 'screening', label: '筛查测评', hint: '按一次测评批次研判' },
  { key: 'manual', label: '手工候选', hint: '咨询师主动开的候选（功能待扩展）' },
  { key: 'all', label: '全部', hint: '筛查 + 手工合并' },
];

export function TopFilterBar({
  mode,
  onModeChange,
  batchId,
  onBatchChange,
  assessmentId,
  onAssessmentChange,
}: {
  mode: TriageMode;
  onModeChange: (m: TriageMode) => void;
  batchId: string | undefined;
  onBatchChange: (b: string | undefined) => void;
  assessmentId: string | undefined;
  onAssessmentChange: (a: string | undefined) => void;
}) {
  const { data: assessments } = useAssessments();
  const { data: batches } = useBatches();

  // Only list screening-purpose assessments in the dropdown — intake-type
  // candidates are handled in their own service detail pages.
  const screeningAssessments = (assessments ?? []).filter(
    (a) => (a as any).assessmentType === 'screening',
  );
  const batchesForAssessment = assessmentId
    ? (batches ?? []).filter((b) => b.assessmentId === assessmentId)
    : (batches ?? []).filter((b) =>
        screeningAssessments.some((a) => a.id === b.assessmentId),
      );

  const disabled = mode === 'manual';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center gap-3 flex-wrap">
      <div className="flex border border-slate-200 rounded-lg overflow-hidden">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onModeChange(m.key)}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              mode === m.key
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
            title={m.hint}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-slate-200" />

      <Filter className="w-4 h-4 text-slate-400" />

      <select
        value={assessmentId ?? ''}
        onChange={(e) => onAssessmentChange(e.target.value || undefined)}
        disabled={disabled}
        className="text-xs border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
      >
        <option value="">所有筛查测评</option>
        {screeningAssessments.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title}
          </option>
        ))}
      </select>

      <select
        value={batchId ?? ''}
        onChange={(e) => onBatchChange(e.target.value || undefined)}
        disabled={disabled}
        className="text-xs border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
      >
        <option value="">所有批次</option>
        {batchesForAssessment.map((b) => (
          <option key={b.id} value={b.id}>
            {b.title}
          </option>
        ))}
      </select>

      {disabled && (
        <span className="text-[11px] text-slate-400">
          "手工候选"模式不需要批次筛选
        </span>
      )}
    </div>
  );
}

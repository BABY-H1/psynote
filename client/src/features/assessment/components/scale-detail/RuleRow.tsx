import { X } from 'lucide-react';
import type { RuleEdit } from './types';
import { RISK_OPTIONS } from './types';

/**
 * A single interpretation rule under a dimension
 * (e.g. "0-9 分 → 最小 → 一级（一般）").
 *
 * Split from DimensionsTab to keep that file lean — the read-mode
 * summary + edit-mode grid here is ~90 lines on its own.
 */
export function RuleRow({
  rule,
  editing,
  onUpdate,
  onRemove,
}: {
  rule: RuleEdit;
  editing: boolean;
  onUpdate: (patch: Partial<RuleEdit>) => void;
  onRemove: () => void;
}) {
  if (!editing) {
    return (
      <div className="bg-slate-50 rounded-lg p-3 space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-xs text-slate-500">
            {rule.minScore} ~ {rule.maxScore} 分
          </span>
          {rule.riskLevel && (
            <span className="text-xs px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">
              {RISK_OPTIONS.find((r) => r.value === rule.riskLevel)?.label || rule.riskLevel}
            </span>
          )}
          <span className="font-medium text-slate-800">{rule.label}</span>
        </div>
        {rule.description && (
          <p className="text-xs text-slate-500">说明: {rule.description}</p>
        )}
        {rule.advice && (
          <p className="text-xs text-slate-500">建议: {rule.advice}</p>
        )}
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          value={rule.minScore || ''}
          onChange={(e) => onUpdate({ minScore: Number(e.target.value) })}
          placeholder="最低分"
          className="w-20 px-2 py-1 border border-slate-200 rounded text-xs"
        />
        <span className="text-xs text-slate-400">~</span>
        <input
          type="number"
          value={rule.maxScore || ''}
          onChange={(e) => onUpdate({ maxScore: Number(e.target.value) })}
          placeholder="最高分"
          className="w-20 px-2 py-1 border border-slate-200 rounded text-xs"
        />
        <input
          value={rule.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="等级标签"
          className="w-28 px-2 py-1 border border-slate-200 rounded text-xs"
        />
        <select
          value={rule.riskLevel}
          onChange={(e) => onUpdate({ riskLevel: e.target.value })}
          className="px-2 py-1 border border-slate-200 rounded text-xs"
        >
          {RISK_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          onClick={onRemove}
          className="ml-auto text-slate-300 hover:text-red-500"
          title="移除规则"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={rule.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="规则说明（可选）"
          className="px-2 py-1 border border-slate-100 rounded text-xs text-slate-600"
        />
        <input
          value={rule.advice}
          onChange={(e) => onUpdate({ advice: e.target.value })}
          placeholder="建议文本（可选）"
          className="px-2 py-1 border border-slate-100 rounded text-xs text-slate-600"
        />
      </div>
    </div>
  );
}

import React from 'react';
import type { TriageLevel } from '@psynote/shared';
import type { TriageBuckets } from '../../../api/useResearchTriage';

export function LevelBucketSidebar({
  levels,
  buckets,
  selectedLevel,
  onSelect,
  isLoading,
  disabled,
}: {
  levels: TriageLevel[];
  buckets: TriageBuckets | undefined;
  selectedLevel: string | undefined;
  onSelect: (level: string | undefined) => void;
  isLoading: boolean;
  disabled?: boolean;
}) {
  const countFor = (key: string): number => {
    if (!buckets) return 0;
    return (buckets as unknown as Record<string, number>)[key] ?? 0;
  };

  return (
    // Phase J 后续: 去掉 rounded-2xl + border (WorkspaceLayout 已经有 border-r),
    // 避免双层边框. h-full 确保撑满 panel 高度.
    <div className="p-2 h-full flex flex-col">
      <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
        分级
      </div>

      <button
        type="button"
        onClick={() => onSelect(undefined)}
        disabled={disabled}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition mb-1 disabled:opacity-50 ${
          !selectedLevel
            ? 'bg-brand-50 text-brand-700'
            : 'text-slate-600 hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center justify-between">
          <span>全部</span>
          {!disabled && buckets && (
            <span className="text-xs text-slate-400">
              {Object.values(buckets).reduce((a, b) => a + b, 0)}
            </span>
          )}
        </div>
      </button>

      <div className="space-y-1">
        {levels.map((lvl) => {
          const selected = selectedLevel === lvl.key;
          const count = countFor(lvl.key);
          return (
            <button
              key={lvl.key}
              type="button"
              onClick={() => onSelect(selected ? undefined : lvl.key)}
              disabled={disabled}
              className={`w-full text-left px-3 py-2 rounded-lg transition disabled:opacity-50 ${
                selected
                  ? 'ring-2 ring-offset-1'
                  : 'hover:bg-slate-50'
              }`}
              style={selected ? { '--tw-ring-color': lvl.color } as React.CSSProperties : undefined}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: lvl.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{lvl.label}</div>
                  <div className="text-[11px] text-slate-400 truncate">{lvl.intervention}</div>
                </div>
                <span
                  className={`text-xs font-bold ${
                    count > 0 ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  {isLoading ? '…' : count}
                </span>
              </div>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onSelect(selectedLevel === '__unrated' ? undefined : '__unrated')}
          disabled={disabled}
          className={`w-full text-left px-3 py-2 rounded-lg transition disabled:opacity-50 ${
            selectedLevel === '__unrated'
              ? 'ring-2 ring-slate-400 ring-offset-1'
              : 'hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-slate-300" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-600">未分级</div>
              <div className="text-[11px] text-slate-400">缺少 riskLevel</div>
            </div>
            <span className="text-xs text-slate-500">
              {isLoading ? '…' : buckets?.unrated ?? 0}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}

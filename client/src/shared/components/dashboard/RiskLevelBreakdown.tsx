import React from 'react';

/**
 * Phase 14d — Overall L1-L4 risk distribution (4 horizontal bars + counts).
 *
 * Used on EnterpriseDashboard left column of "分布·风险" section as the "总"
 * (overall) view next to the per-department matrix (the "分" view).
 *
 * Values are absolute counts; percentages are computed from the row sum.
 */

const LEVEL_CONFIG = [
  { key: 'level_1', label: 'L1 健康', color: 'bg-emerald-400', text: 'text-emerald-700' },
  { key: 'level_2', label: 'L2 关注', color: 'bg-amber-400', text: 'text-amber-700' },
  { key: 'level_3', label: 'L3 建议', color: 'bg-orange-500', text: 'text-orange-700' },
  { key: 'level_4', label: 'L4 紧急', color: 'bg-rose-500', text: 'text-rose-700' },
] as const;

export interface RiskLevelBreakdownProps {
  distribution: {
    level_1: number;
    level_2: number;
    level_3: number;
    level_4: number;
  };
  /** Whether to show percentage alongside count */
  showPercent?: boolean;
}

export function RiskLevelBreakdown({ distribution, showPercent = true }: RiskLevelBreakdownProps) {
  const total = distribution.level_1 + distribution.level_2 + distribution.level_3 + distribution.level_4;

  if (total === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-400">暂无测评数据</div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {LEVEL_CONFIG.map(({ key, label, color, text }) => {
        const cnt = distribution[key];
        const pct = Math.round((cnt / total) * 100);
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-medium ${text}`}>{label}</span>
              <span className="text-slate-500 tabular-nums">
                {cnt} 人
                {showPercent && <span className="text-slate-400 ml-1">· {pct}%</span>}
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded overflow-hidden">
              <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      <div className="pt-2 mt-2 border-t border-slate-100 text-[11px] text-slate-400 text-right">
        合计 {total} 人
      </div>
    </div>
  );
}

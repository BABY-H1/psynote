import React from 'react';

/**
 * Phase 14c — Extracted from features/collaboration/CrisisDashboardTab.tsx.
 *
 * Renders a small "opened vs closed per month" bar-pair chart for the last
 * N months. Used by the crisis dashboard (open vs close) and reusable by
 * any future 2-series monthly trend view.
 */

export interface MonthlyTrendPoint {
  /** "YYYY-MM" */
  month: string;
  opened: number;
  closed: number;
}

export interface MonthlyTrendChartProps {
  data: MonthlyTrendPoint[];
  /** Override legend labels */
  openedLabel?: string;
  closedLabel?: string;
  emptyText?: string;
}

export function MonthlyTrendChart({
  data, openedLabel = '开案', closedLabel = '结案', emptyText = '暂无数据',
}: MonthlyTrendChartProps) {
  if (!data || data.length === 0) {
    return <div className="p-8 text-center text-sm text-slate-400">{emptyText}</div>;
  }
  if (data.every((m) => m.opened === 0 && m.closed === 0)) {
    return <div className="p-8 text-center text-sm text-slate-400">{emptyText}</div>;
  }

  const max = Math.max(1, ...data.flatMap((d) => [d.opened, d.closed]));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-2">
        {data.map((m) => (
          <div key={m.month} className="text-center">
            <div className="flex items-end justify-center gap-1 h-24">
              <div
                className="w-3 bg-rose-400 rounded-t"
                style={{ height: `${(m.opened / max) * 100}%` }}
                title={`${openedLabel} ${m.opened}`}
              />
              <div
                className="w-3 bg-emerald-400 rounded-t"
                style={{ height: `${(m.closed / max) * 100}%` }}
                title={`${closedLabel} ${m.closed}`}
              />
            </div>
            <div className="text-[10px] text-slate-400 mt-1">{m.month.slice(5)}</div>
            <div className="text-[10px] text-slate-500 leading-tight">
              <span className="text-rose-600">{m.opened}</span>
              <span className="text-slate-300 mx-0.5">/</span>
              <span className="text-emerald-600">{m.closed}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 bg-rose-400 rounded inline-block" />
          {openedLabel}
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 bg-emerald-400 rounded inline-block" />
          {closedLabel}
        </div>
      </div>
    </div>
  );
}

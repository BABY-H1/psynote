import React from 'react';

/**
 * Phase 14c — Reusable "dimension × risk level" stacked bar list.
 *
 * Each row = one dimension (e.g. class "高一(3)班" or department "研发部"),
 * showing an inline horizontal stacked bar of L1→L4 counts with numeric
 * labels on the right.
 *
 * Used by:
 *   - SchoolDashboard (class × risk matrix)
 *   - HRDashboardHome (department × risk matrix, with k-anonymity handled
 *     upstream via the "其他" bucket)
 *
 * Design:
 *   - Colors: L1 emerald, L2 amber, L3 orange, L4 rose
 *   - Widths proportional to count within the row (row-local scaling)
 *   - If totalAssessed = 0, show "暂无数据" placeholder bar
 *   - Click handler optional (could jump to drill-down class/dept detail)
 */

export interface RiskBarStackRow {
  /** Primary label, e.g. "高一(3)班" */
  label: string;
  /** Optional sub-label, e.g. enrolled count "45 人" */
  subLabel?: string;
  riskCounts: {
    level_1: number;
    level_2: number;
    level_3: number;
    level_4: number;
  };
  /** Used to hide rows with no assessment completed */
  totalAssessed: number;
}

export interface RiskBarStackProps {
  rows: RiskBarStackRow[];
  /** Max height for the scrollable container. null/undefined = no limit */
  maxHeight?: string;
  onRowClick?: (row: RiskBarStackRow) => void;
  /** Show "暂无测评" empty state when list is empty */
  emptyText?: string;
}

const LEVEL_COLORS = {
  level_1: 'bg-emerald-300',
  level_2: 'bg-amber-300',
  level_3: 'bg-orange-400',
  level_4: 'bg-rose-500',
} as const;

const LEVEL_LABELS = {
  level_1: 'L1 健康',
  level_2: 'L2 关注',
  level_3: 'L3 建议',
  level_4: 'L4 紧急',
} as const;

export function RiskBarStack({
  rows, maxHeight = 'max-h-80', onRowClick, emptyText = '暂无数据',
}: RiskBarStackProps) {
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-400">{emptyText}</div>
    );
  }

  return (
    <div className={`${maxHeight} overflow-y-auto`}>
      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-slate-500 px-3 py-2 border-b border-slate-100 sticky top-0 bg-white z-10">
        {(Object.keys(LEVEL_COLORS) as (keyof typeof LEVEL_COLORS)[]).map((k) => (
          <div key={k} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-sm inline-block ${LEVEL_COLORS[k]}`} />
            <span>{LEVEL_LABELS[k]}</span>
          </div>
        ))}
      </div>

      <div className="divide-y divide-slate-100">
        {rows.map((row, i) => {
          const clickable = !!onRowClick;
          const RowComp: any = clickable ? 'button' : 'div';
          return (
            <RowComp
              key={`${row.label}-${i}`}
              type={clickable ? 'button' : undefined}
              onClick={clickable ? () => onRowClick!(row) : undefined}
              className={`w-full grid grid-cols-12 items-center gap-2 px-3 py-2 text-left ${
                clickable ? 'hover:bg-slate-50 transition cursor-pointer' : ''
              }`}
            >
              {/* Label column */}
              <div className="col-span-4 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{row.label}</div>
                {row.subLabel && (
                  <div className="text-[10px] text-slate-400">{row.subLabel}</div>
                )}
              </div>

              {/* Stacked bar */}
              <div className="col-span-6 flex h-4 rounded overflow-hidden bg-slate-100">
                {row.totalAssessed === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-[10px] text-slate-400">
                    暂无测评
                  </div>
                ) : (
                  (Object.keys(LEVEL_COLORS) as (keyof typeof LEVEL_COLORS)[]).map((lv) => {
                    const cnt = row.riskCounts[lv] ?? 0;
                    const pct = (cnt / row.totalAssessed) * 100;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={lv}
                        className={`${LEVEL_COLORS[lv]} flex items-center justify-center`}
                        style={{ width: `${pct}%` }}
                        title={`${LEVEL_LABELS[lv]}: ${cnt}`}
                      >
                        {pct >= 12 && (
                          <span className="text-[9px] text-white font-semibold">{cnt}</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Counts summary */}
              <div className="col-span-2 text-right text-xs text-slate-600">
                <span className="font-medium">{row.totalAssessed}</span>
                <span className="text-slate-400 ml-1">人</span>
              </div>
            </RowComp>
          );
        })}
      </div>
    </div>
  );
}

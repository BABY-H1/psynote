import React from 'react';

/**
 * Phase 14c — Unified dashboard stat tile.
 *
 * Replaces inline implementations that were duplicated across:
 *   - features/dashboard/pages/OrgAdminDashboard.tsx (MetricCard)
 *   - features/collaboration/CrisisDashboardTab.tsx (StatCard)
 *   - features/dashboard/pages/SchoolDashboard.tsx (inline)
 *   - features/eap-dashboard/pages/HRDashboardHome.tsx (inline)
 *
 * All variants share the same visual template: icon + label + value, with
 * an optional highlight ring, suffix, loading state, click-through, and hint.
 */

export type StatTileTone =
  | 'slate'    // neutral grey (default operational)
  | 'brand'    // primary brand color
  | 'blue'
  | 'emerald'  // L1 健康 / 已结案
  | 'green'
  | 'amber'    // L2 关注 / 待办
  | 'orange'   // L3 建议
  | 'rose'     // L4 紧急 / 危机
  | 'violet'
  | 'teal'
  | 'indigo';

const TONE_MAP: Record<StatTileTone, { iconBg: string; iconText: string }> = {
  slate:   { iconBg: 'bg-slate-50',   iconText: 'text-slate-600' },
  brand:   { iconBg: 'bg-brand-50',   iconText: 'text-brand-600' },
  blue:    { iconBg: 'bg-blue-50',    iconText: 'text-blue-600' },
  emerald: { iconBg: 'bg-emerald-50', iconText: 'text-emerald-600' },
  green:   { iconBg: 'bg-green-50',   iconText: 'text-green-600' },
  amber:   { iconBg: 'bg-amber-50',   iconText: 'text-amber-600' },
  orange:  { iconBg: 'bg-orange-50',  iconText: 'text-orange-600' },
  rose:    { iconBg: 'bg-rose-50',    iconText: 'text-rose-600' },
  violet:  { iconBg: 'bg-violet-50',  iconText: 'text-violet-600' },
  teal:    { iconBg: 'bg-teal-50',    iconText: 'text-teal-600' },
  indigo:  { iconBg: 'bg-indigo-50',  iconText: 'text-indigo-600' },
};

export interface StatTileProps {
  icon?: React.ReactNode;
  label: string;
  value: number | string | undefined;
  /** e.g. "人次", "场", "人", "个" */
  suffix?: string;
  tone?: StatTileTone;
  loading?: boolean;
  /** Red ring + red value text to emphasize attention-needed */
  highlight?: boolean;
  onClick?: () => void;
  /** Small muted text shown next to label, e.g. "即将上线" / "最多 5 人" */
  hint?: string;
}

export function StatTile({
  icon, label, value, suffix, tone = 'slate',
  loading, highlight, onClick, hint,
}: StatTileProps) {
  const t = TONE_MAP[tone];
  const Comp: any = onClick ? 'button' : 'div';
  const displayValue = loading
    ? '—'
    : (value ?? 0);

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={
        `bg-white rounded-xl p-4 flex items-center gap-4 text-left border transition ${
          highlight
            ? 'border-rose-200 ring-1 ring-rose-100'
            : 'border-slate-200'
        } ${
          onClick ? 'hover:border-slate-300 hover:bg-slate-50 cursor-pointer' : ''
        }`
      }
    >
      {icon && (
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${t.iconBg} ${t.iconText}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className={`text-2xl font-bold ${highlight ? 'text-rose-700' : 'text-slate-900'}`}>
          {displayValue}
          {suffix && !loading && (
            <span className="text-sm font-normal text-slate-400 ml-1">{suffix}</span>
          )}
        </div>
        <div className="text-xs text-slate-500 truncate">
          {label}
          {hint && <span className="text-slate-300 ml-2">{hint}</span>}
        </div>
      </div>
    </Comp>
  );
}

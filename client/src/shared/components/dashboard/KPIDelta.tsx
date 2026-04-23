import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { StatTileTone } from './StatTile';

/**
 * KPI tile with environmental comparison (当期 vs 上期).
 *
 * Visual: icon + label above, big current value + suffix below, plus a pill
 * showing 上期值 and delta arrow with %.
 *
 * Delta semantics: all 5 Org-Admin KPIs treat "up = good" (more new clients,
 * more sessions, etc.), so ▲ is rendered green and ▼ red. For metrics where
 * that's inverted (e.g. crisis counts), pass `invertDelta` so colors flip.
 */

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

export interface KPIDeltaProps {
  icon?: React.ReactNode;
  label: string;
  current: number | undefined;
  previous: number | undefined;
  suffix?: string;
  tone?: StatTileTone;
  loading?: boolean;
  onClick?: () => void;
  /** If true, rising is bad (red), falling is good (green). Default: rising is good. */
  invertDelta?: boolean;
  /** Label for the previous-period comparison. Defaults to "上月同期". */
  prevLabel?: string;
  /** Reduce padding / font sizes for tight side columns */
  compact?: boolean;
}

export function KPIDelta({
  icon, label, current, previous, suffix, tone = 'slate',
  loading, onClick, invertDelta, prevLabel = '上月同期', compact,
}: KPIDeltaProps) {
  const t = TONE_MAP[tone];
  const Comp: any = onClick ? 'button' : 'div';
  const cur = current ?? 0;
  const prev = previous ?? 0;

  const delta = prev === 0 ? null : (cur - prev) / prev;
  const absDelta = cur - prev;
  const noChange = delta !== null && Math.abs(delta) < 0.005;

  // Color semantics
  let deltaColor = 'text-slate-400';
  let ArrowIcon: React.ComponentType<{ className?: string }> = Minus;
  if (delta !== null && !noChange) {
    const isRising = delta > 0;
    const isGood = invertDelta ? !isRising : isRising;
    deltaColor = isGood ? 'text-emerald-600' : 'text-rose-600';
    ArrowIcon = isRising ? ArrowUp : ArrowDown;
  }

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={
        `bg-white rounded-xl border border-slate-200 flex flex-col text-left transition ${
          compact ? 'p-2.5 gap-1' : 'p-4 gap-2'
        } ${
          onClick ? 'hover:border-slate-300 hover:bg-slate-50 cursor-pointer' : ''
        }`
      }
    >
      <div className="flex items-center gap-2">
        {icon && (
          <div className={`rounded-md flex items-center justify-center flex-shrink-0 ${
            compact ? 'w-5 h-5' : 'w-7 h-7'
          } ${t.iconBg} ${t.iconText}`}>
            {icon}
          </div>
        )}
        <span className={`text-slate-500 truncate ${compact ? 'text-[11px]' : 'text-xs'}`}>{label}</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className={`font-bold text-slate-900 leading-none ${compact ? 'text-lg' : 'text-2xl'}`}>
          {loading ? '—' : cur}
        </span>
        {suffix && !loading && (
          <span className={`text-slate-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>{suffix}</span>
        )}
      </div>

      {!loading && (
        <div className={`flex items-center gap-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          <ArrowIcon className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} ${deltaColor}`} />
          <span className={deltaColor}>
            {delta === null
              ? (cur > 0 ? '新' : '持平')
              : noChange
                ? '持平'
                : `${Math.abs(Math.round(delta * 100))}%`}
          </span>
          <span className="text-slate-400 ml-1 truncate">
            {prevLabel} {prev}{suffix || ''}
            {delta !== null && !noChange && !compact && (
              <> · {absDelta > 0 ? '+' : ''}{absDelta}</>
            )}
          </span>
        </div>
      )}
    </Comp>
  );
}

import React from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Phase 8c — TaskCard: a todo/action item shown on the HomeTab.
 *
 * Used for surfaces like:
 *   - "待签署 2 份协议"         (icon=FileText,  tone='amber')
 *   - "待填写 1 份测评"          (icon=ClipboardCheck, tone='brand')
 *   - "明天 14:00 个案会谈"      (icon=Calendar, tone='blue')
 *
 * Props are intentionally minimal; the icon is passed as a ReactNode so the
 * caller can customize stroke width, color, or wrap in its own container if
 * needed. Click handler navigates somewhere — the card itself is a button.
 */

export interface TaskCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  /** Tone affects the icon container background + text color */
  tone?: 'brand' | 'amber' | 'blue' | 'green' | 'rose';
  /** Optional numeric badge (e.g. "2 份待办") */
  badge?: string | number;
}

const TONE_MAP: Record<NonNullable<TaskCardProps['tone']>, { bg: string; text: string }> = {
  brand: { bg: 'bg-brand-50', text: 'text-brand-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  green: { bg: 'bg-green-50', text: 'text-green-600' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600' },
};

export function TaskCard({
  icon,
  title,
  subtitle,
  onClick,
  tone = 'brand',
  badge,
}: TaskCardProps) {
  const toneStyles = TONE_MAP[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 text-left transition active:scale-[0.98] hover:border-slate-300 disabled:opacity-100"
    >
      <div
        className={`w-11 h-11 rounded-xl ${toneStyles.bg} ${toneStyles.text} flex items-center justify-center flex-shrink-0`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">{title}</div>
        {subtitle && (
          <div className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</div>
        )}
      </div>
      {badge !== undefined && (
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${toneStyles.bg} ${toneStyles.text} flex-shrink-0`}
        >
          {badge}
        </span>
      )}
      {onClick && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
    </button>
  );
}

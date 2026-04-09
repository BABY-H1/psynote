import React from 'react';
import { ChevronRight, Activity, Layers, BookOpen } from 'lucide-react';

/**
 * Phase 8c — ServiceCard: a client-facing card for one of "my services".
 *
 * Shown in 3 sections on MyServicesTab:
 *   - 我的咨询 (counseling)    — kind='counseling', title=咨询标题, meta=下次预约/会谈次数
 *   - 我的团辅 (group)         — kind='group',      title=团辅活动名, meta=进度 X/Y
 *   - 我的课程 (course)        — kind='course',     title=课程名,     meta=进度 X/Y
 *
 * Mobile-first visuals: rounded-2xl, subtle shadow, generous padding,
 * whole card is clickable, chevron on the right indicates drill-down.
 *
 * The meta line is a free-form ReactNode so callers can pass a progress bar,
 * a "下次" timestamp, a status pill, whatever — this component intentionally
 * doesn't enforce a rigid schema.
 */

export type ServiceKind = 'counseling' | 'group' | 'course';

const KIND_CONFIG: Record<
  ServiceKind,
  { icon: React.ComponentType<{ className?: string }>; bg: string; text: string; label: string }
> = {
  counseling: { icon: Activity, bg: 'bg-brand-50', text: 'text-brand-600', label: '个案' },
  group: { icon: Layers, bg: 'bg-amber-50', text: 'text-amber-600', label: '团辅' },
  course: { icon: BookOpen, bg: 'bg-purple-50', text: 'text-purple-600', label: '课程' },
};

export interface ServiceCardProps {
  kind: ServiceKind;
  title: string;
  /** Optional short tag rendered to the right of the title (e.g. status) */
  badge?: { text: string; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'rose' };
  /** Secondary text — e.g. "下次: 4月12日 14:00" or "进度 3/8" */
  meta?: React.ReactNode;
  /** Optional description line */
  description?: string;
  onClick?: () => void;
}

const BADGE_TONE: Record<NonNullable<NonNullable<ServiceCardProps['badge']>['tone']>, string> = {
  slate: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
};

export function ServiceCard({ kind, title, badge, meta, description, onClick }: ServiceCardProps) {
  const cfg = KIND_CONFIG[kind];
  const Icon = cfg.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-start gap-3 text-left transition active:scale-[0.98] hover:border-slate-300 disabled:opacity-100"
    >
      <div
        className={`w-11 h-11 rounded-xl ${cfg.bg} ${cfg.text} flex items-center justify-center flex-shrink-0`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-slate-900 truncate">{title}</span>
          {badge && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${BADGE_TONE[badge.tone ?? 'slate']}`}
            >
              {badge.text}
            </span>
          )}
        </div>
        {description && (
          <div className="text-xs text-slate-500 mt-1 line-clamp-2">{description}</div>
        )}
        {meta && <div className="text-xs text-slate-400 mt-1.5">{meta}</div>}
      </div>
      {onClick && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-3" />}
    </button>
  );
}

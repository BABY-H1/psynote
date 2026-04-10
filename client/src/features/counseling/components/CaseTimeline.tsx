/**
 * Phase 9δ — Case Timeline (enriched).
 *
 * Renders a vertical chronological stream of every event tied to a care
 * episode: care_timeline events, session notes, assessment results, group
 * enrollments, course enrollments, referrals, follow-up reviews.
 *
 * Each row is colour-coded by `kind` so the counselor can scan quickly.
 * The component is layout-only — it doesn't navigate anywhere — but each
 * row exposes ref data so a parent could wire drill-down later.
 */
import React from 'react';
import {
  FileText, Calendar, ClipboardList, Users, BookOpen,
  ArrowUpRight, RotateCcw, Sparkles, Circle,
} from 'lucide-react';
import { useEnrichedTimeline, type EnrichedTimelineItem } from '../../../api/useCounseling';

interface KindMeta {
  label: string;
  bg: string;
  text: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const KIND_META: Record<string, KindMeta> = {
  event:             { label: '事件',     bg: 'bg-slate-100',   text: 'text-slate-600',   Icon: Circle },
  session_note:      { label: '会谈记录', bg: 'bg-indigo-100',  text: 'text-indigo-700',  Icon: FileText },
  assessment_result: { label: '测评',     bg: 'bg-blue-100',    text: 'text-blue-700',    Icon: ClipboardList },
  group_enrollment:  { label: '团辅',     bg: 'bg-violet-100',  text: 'text-violet-700',  Icon: Users },
  course_enrollment: { label: '课程',     bg: 'bg-cyan-100',    text: 'text-cyan-700',    Icon: BookOpen },
  referral:          { label: '转介',     bg: 'bg-rose-100',    text: 'text-rose-700',    Icon: ArrowUpRight },
  follow_up_review:  { label: '随访',     bg: 'bg-emerald-100', text: 'text-emerald-700', Icon: RotateCcw },
  ai_insight:        { label: 'AI',       bg: 'bg-amber-100',   text: 'text-amber-700',   Icon: Sparkles },
};

interface Props {
  episodeId: string;
  /** Optional click handler — receives the ref so parent can drill down. */
  onItemClick?: (item: EnrichedTimelineItem) => void;
}

export function CaseTimeline({ episodeId, onItemClick }: Props) {
  const { data: items = [], isLoading } = useEnrichedTimeline(episodeId);

  if (isLoading) {
    return <div className="text-sm text-slate-400 py-8 text-center">加载时间线…</div>;
  }
  if (items.length === 0) {
    return (
      <div className="text-sm text-slate-400 py-8 text-center">
        本个案暂无任何事件
      </div>
    );
  }

  // Group by date for the heading rows
  const groups = groupByDate(items);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.date}>
          <div className="text-xs font-semibold text-slate-500 mb-2">{group.date}</div>
          <div className="relative space-y-3 pl-6">
            {/* Vertical spine */}
            <div className="absolute left-2 top-2 bottom-2 w-px bg-slate-200" />
            {group.items.map((item) => {
              const meta = KIND_META[item.kind] ?? KIND_META.event;
              const Icon = meta.Icon;
              return (
                <div
                  key={item.id}
                  className={`relative ${onItemClick ? 'cursor-pointer hover:bg-slate-50' : ''} rounded-lg p-2 -ml-2`}
                  onClick={onItemClick ? () => onItemClick(item) : undefined}
                >
                  {/* Dot */}
                  <div
                    className={`absolute -left-3 top-3 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${meta.bg}`}
                  >
                    <Icon className={`w-2.5 h-2.5 ${meta.text}`} />
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${meta.bg} ${meta.text}`}>
                      {meta.label}
                    </span>
                    <span className="text-sm font-medium text-slate-800">{item.title}</span>
                    <span className="text-xs text-slate-400 ml-auto flex-shrink-0">
                      {formatTime(item.occurredAt)}
                    </span>
                  </div>
                  {item.summary && (
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.summary}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupByDate(items: EnrichedTimelineItem[]): { date: string; items: EnrichedTimelineItem[] }[] {
  const map = new Map<string, EnrichedTimelineItem[]>();
  for (const item of items) {
    const date = item.occurredAt
      ? new Date(item.occurredAt).toLocaleDateString('zh-CN')
      : '未知日期';
    const arr = map.get(date) ?? [];
    arr.push(item);
    map.set(date, arr);
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

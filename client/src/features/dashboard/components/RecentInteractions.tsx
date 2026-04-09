import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Layers, BookOpen, ClipboardList } from 'lucide-react';
import { useEpisodes } from '../../../api/useCounseling';
import { useGroupInstances } from '../../../api/useGroups';
import { useCourses } from '../../../api/useCourses';

/**
 * 档案库 · 过去 — 最近互动
 *
 * 把 episodes / groups / courses 的活跃实例按 `updatedAt desc` 合并取前 8 条。
 * 不调用 timeline API，纯客户端聚合，作为 Phase 1 的 v1 实现。
 *
 * 真正的跨模块"对象档案"会在 Phase 6 实现，那时再替换为 PersonArchivePreview。
 */

interface InteractionItem {
  id: string;
  kind: 'counseling' | 'group' | 'course';
  title: string;
  updatedAt: string;
  onClick: () => void;
}

const KIND_META: Record<
  InteractionItem['kind'],
  { label: string; icon: React.ReactNode; tone: string }
> = {
  counseling: {
    label: '个案',
    icon: <Activity className="w-3.5 h-3.5" />,
    tone: 'bg-brand-50 text-brand-700',
  },
  group: {
    label: '团辅',
    icon: <Layers className="w-3.5 h-3.5" />,
    tone: 'bg-amber-50 text-amber-700',
  },
  course: {
    label: '课程',
    icon: <BookOpen className="w-3.5 h-3.5" />,
    tone: 'bg-purple-50 text-purple-700',
  },
};

export function RecentInteractions() {
  const navigate = useNavigate();

  const { data: episodes } = useEpisodes();
  const { data: groups } = useGroupInstances();
  const { data: courses } = useCourses();

  const items: InteractionItem[] = [
    ...(episodes ?? [])
      .filter((e) => e.status === 'active')
      .map<InteractionItem>((e) => ({
        id: `ep-${e.id}`,
        kind: 'counseling',
        title: (e as any).client?.name ? `${(e as any).client.name} · 个案` : '个案',
        updatedAt: e.updatedAt,
        onClick: () => navigate(`/episodes/${e.id}`),
      })),
    ...(groups ?? [])
      .filter((g) => g.status === 'recruiting' || g.status === 'ongoing' || g.status === 'full')
      .map<InteractionItem>((g) => ({
        id: `grp-${g.id}`,
        kind: 'group',
        title: g.title,
        updatedAt: g.updatedAt,
        onClick: () => navigate('/groups'),
      })),
    ...(courses ?? [])
      .filter((c) => c.status === 'published')
      .map<InteractionItem>((c) => ({
        id: `crs-${c.id}`,
        kind: 'course',
        title: c.title,
        updatedAt: c.updatedAt,
        onClick: () => navigate('/courses'),
      })),
  ]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">最近互动</h3>
        <ClipboardList className="w-4 h-4 text-slate-300" />
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400">暂无近期活动</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => {
            const meta = KIND_META[it.kind];
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={it.onClick}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition text-left"
                >
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${meta.tone}`}
                  >
                    {meta.icon}
                    {meta.label}
                  </span>
                  <span className="text-sm text-slate-700 truncate flex-1">{it.title}</span>
                  <span className="text-xs text-slate-400 shrink-0">{formatRelative(it.updatedAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 月前`;
  return `${Math.floor(days / 365)} 年前`;
}

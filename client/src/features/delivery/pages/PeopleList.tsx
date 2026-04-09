import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Activity, Layers, BookOpen, ClipboardList, ChevronRight } from 'lucide-react';
import { PageLoading, EmptyCard } from '../../../shared/components';
import { usePeople, type PersonSummary } from '../../../api/usePersonArchive';

/**
 * Phase 6 — PeopleList page.
 *
 * Lists every user in the org who has at least one cross-module service
 * touchpoint (counseling / group / course / assessment), sorted by most
 * recent activity. Each row shows kind-by-kind counts as small badges and a
 * relative-time "last active" hint. Click a row → `/delivery/people/:userId`.
 *
 * Mounted at:
 *   /delivery/people
 *   /delivery?type=archive (also renders this component inline via DeliveryCenter)
 */
export function PeopleList() {
  const navigate = useNavigate();
  const { data, isLoading } = usePeople();
  const [search, setSearch] = useState('');

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">对象档案</h2>
        <p className="text-sm text-slate-500 mt-1">
          按"对象（来访者 / 学员 / 受测者）"维度查看跨模块服务历史。共 {data?.items.length ?? 0} 人。
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索姓名或邮箱"
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <PageLoading />
      ) : items.length === 0 ? (
        <EmptyCard
          title={search ? '没有匹配的对象' : '暂无对象'}
          description={
            search ? '尝试调整搜索词' : '当任何用户参与至少一项服务后，他们会出现在这里'
          }
        />
      ) : (
        <ul className="space-y-2">
          {items.map((person) => (
            <PersonRow
              key={person.userId}
              person={person}
              onClick={() => navigate(`/delivery/people/${person.userId}`)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PersonRow({ person, onClick }: { person: PersonSummary; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full bg-white rounded-xl border border-slate-200 hover:shadow-sm hover:border-slate-300 transition flex items-center gap-4 px-5 py-4 text-left"
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
          {person.name.charAt(0)}
        </div>

        {/* Name + email */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 truncate">{person.name}</span>
          </div>
          {person.email && (
            <div className="text-xs text-slate-400 truncate">{person.email}</div>
          )}
        </div>

        {/* Kind badges */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {person.counts.counseling > 0 && (
            <KindBadge icon={<Activity className="w-3 h-3" />} count={person.counts.counseling} tone="brand" />
          )}
          {person.counts.group > 0 && (
            <KindBadge icon={<Layers className="w-3 h-3" />} count={person.counts.group} tone="amber" />
          )}
          {person.counts.course > 0 && (
            <KindBadge icon={<BookOpen className="w-3 h-3" />} count={person.counts.course} tone="purple" />
          )}
          {person.counts.assessment > 0 && (
            <KindBadge icon={<ClipboardList className="w-3 h-3" />} count={person.counts.assessment} tone="cyan" />
          )}
        </div>

        {/* Last activity */}
        <div className="text-xs text-slate-400 flex-shrink-0 w-20 text-right">
          {formatRelative(person.lastActivityAt)}
        </div>

        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
      </button>
    </li>
  );
}

const TONE: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  amber: 'bg-amber-50 text-amber-600',
  purple: 'bg-purple-50 text-purple-600',
  cyan: 'bg-cyan-50 text-cyan-600',
};

function KindBadge({
  icon,
  count,
  tone,
}: {
  icon: React.ReactNode;
  count: number;
  tone: keyof typeof TONE | string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${TONE[tone] ?? TONE.brand}`}>
      {icon}
      {count}
    </span>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 月前`;
  return `${Math.floor(days / 365)} 年前`;
}

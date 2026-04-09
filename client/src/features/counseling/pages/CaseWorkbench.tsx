import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEpisodes } from '../../../api/useCounseling';
import {
  PageLoading,
  StatusFilterTabs,
  EmptyCard,
  DeliveryCard,
  type StatusFilterOption,
  type DeliveryCardData,
} from '../../../shared/components';
import { Search, Plus, ChevronDown, ChevronRight, User } from 'lucide-react';
import type { ServiceStatus } from '@psynote/shared';

/**
 * Phase 4d — CaseWorkbench migrated to Phase 2 shared components.
 *
 * Visual & behavioural changes from the previous version:
 *  - Status filter row → `<StatusFilterTabs>` with count badges (preserves the
 *    original 3-tab UX: 全部 / 进行中 / 已结案, where each tab maps to a
 *    *logical* status group, not a single raw status).
 *  - Empty state → `<EmptyCard>`
 *  - Per-episode card render → `<DeliveryCard>`. The status pill text and color
 *    are kept identical to the previous version via `statusText` /
 *    `statusClassName` overrides, since counseling episodes use 已结案 / 暂停
 *    rather than the default ServiceStatus labels.
 *
 * Behaviour preserved:
 *  - Episodes are grouped by client. When a client has multiple episodes, a
 *    collapsible group header is shown (this is a domain-specific feature: the
 *    same client may go through several care episodes over time and the UI
 *    reflects that history).
 *  - Singles render as a flat DeliveryCard (`onOpen` → navigate to detail).
 *  - Multi-episode groups render the same DeliveryCard inside the expanded body
 *    (compact, no client name in the title since it's already in the header).
 *  - Search by client name or chief complaint.
 *  - Status filtering by logical group, not raw status.
 */

const STATUS_TONE: Record<string, { text: string; cls: string }> = {
  active: { text: '进行中', cls: 'bg-blue-50 text-blue-700' },
  paused: { text: '暂停', cls: 'bg-yellow-50 text-yellow-700' },
  closed: { text: '已结案', cls: 'bg-slate-100 text-slate-500' },
  archived: { text: '已归档', cls: 'bg-slate-100 text-slate-400' },
};

function mapEpisodeStatus(s: string): ServiceStatus {
  switch (s) {
    case 'active':
      return 'ongoing';
    case 'paused':
      return 'paused';
    case 'closed':
      return 'closed';
    case 'archived':
      return 'archived';
    default:
      return 'draft';
  }
}

type StatusFilter = '' | 'active' | 'closed';

export function CaseWorkbench() {
  const navigate = useNavigate();
  const { data: episodes, isLoading } = useEpisodes();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');

  // Counts (always reflect ALL episodes regardless of current filter/search)
  const counts = useMemo(() => {
    const arr = episodes ?? [];
    return {
      all: arr.length,
      active: arr.filter((e: any) => e.status === 'active' || e.status === 'paused').length,
      closed: arr.filter((e: any) => e.status === 'closed' || e.status === 'archived').length,
    };
  }, [episodes]);

  const statusOptions = useMemo<StatusFilterOption[]>(() => [
    { value: '', label: '全部', count: counts.all, countTone: 'slate' },
    { value: 'active', label: '进行中', count: counts.active, countTone: 'slate' },
    { value: 'closed', label: '已结案', count: counts.closed, countTone: 'slate' },
  ], [counts]);

  const filtered = useMemo(() => {
    let arr = (episodes ?? []) as any[];
    if (statusFilter === 'active') {
      arr = arr.filter((ep) => ep.status === 'active' || ep.status === 'paused');
    } else if (statusFilter === 'closed') {
      arr = arr.filter((ep) => ep.status === 'closed' || ep.status === 'archived');
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(
        (ep) =>
          ep.client?.name?.toLowerCase().includes(q) ||
          ep.chiefComplaint?.toLowerCase().includes(q),
      );
    }
    return arr;
  }, [episodes, statusFilter, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">个案管理</h1>
          <p className="text-sm text-slate-500 mt-1">
            共 {counts.all} 个个案，{counts.active} 个进行中
          </p>
        </div>
        <button
          onClick={() => navigate('/episodes/new')}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          新建个案
        </button>
      </div>

      {/* Filters: search input + StatusFilterTabs */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名或主诉"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <StatusFilterTabs
          options={statusOptions}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
        />
      </div>

      {/* Episode list grouped by client */}
      {isLoading ? (
        <PageLoading />
      ) : filtered.length === 0 ? (
        <EmptyCard
          title={search || statusFilter ? '未找到匹配的个案' : '暂无个案'}
          description={search || statusFilter ? '尝试调整筛选或搜索词' : '点击右上角新建第一个个案'}
          action={!search && !statusFilter ? { label: '+ 新建个案', onClick: () => navigate('/episodes/new') } : undefined}
        />
      ) : (
        <ClientGroupedList episodes={filtered} navigate={navigate} />
      )}
    </div>
  );
}

interface ClientGroup {
  clientId: string;
  clientName: string;
  episodes: any[];
}

/**
 * Group episodes by client. Singles render as flat DeliveryCards; clients with
 * multiple episodes render a collapsible container with a slim header and
 * DeliveryCards (compact, untitled) inside.
 */
function ClientGroupedList({ episodes, navigate }: { episodes: any[]; navigate: (path: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Group by clientId
  const groups: ClientGroup[] = [];
  const map = new Map<string, ClientGroup>();
  for (const ep of episodes) {
    const cid = ep.clientId || ep.client?.id || 'unknown';
    let group = map.get(cid);
    if (!group) {
      group = { clientId: cid, clientName: ep.client?.name || '未知来访者', episodes: [] };
      map.set(cid, group);
      groups.push(group);
    }
    group.episodes.push(ep);
  }

  const toggle = (clientId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const isMulti = group.episodes.length > 1;
        const isCollapsed = collapsed.has(group.clientId);

        if (!isMulti) {
          // Single episode → flat DeliveryCard with the client name as title
          const ep = group.episodes[0];
          return (
            <EpisodeDeliveryCard
              key={ep.id}
              ep={ep}
              titleMode="client"
              onOpen={() => navigate(`/episodes/${ep.id}`)}
            />
          );
        }

        // Multi-episode group → collapsible container
        return (
          <div key={group.clientId} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => toggle(group.clientId)}
              className="w-full text-left flex items-center gap-2 px-4 py-3 hover:bg-slate-50 transition"
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              <User className="w-4 h-4 text-brand-500" />
              <span className="text-sm font-semibold text-slate-900">{group.clientName}</span>
              <span className="text-xs text-slate-400">{group.episodes.length} 个个案</span>
            </button>
            {!isCollapsed && (
              <div className="border-t border-slate-100 p-3 space-y-2 bg-slate-50/50">
                {group.episodes.map((ep) => (
                  <EpisodeDeliveryCard
                    key={ep.id}
                    ep={ep}
                    titleMode="complaint"
                    onOpen={() => navigate(`/episodes/${ep.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Renders one episode as a `DeliveryCard`. The title shown depends on context:
 *   `titleMode="client"`     — used for top-level singles. Title = client name.
 *   `titleMode="complaint"`  — used for nested rows inside a multi-episode
 *                              group. Title = chief complaint (or fallback),
 *                              since the client name is already in the header.
 */
function EpisodeDeliveryCard({
  ep,
  titleMode,
  onOpen,
}: {
  ep: any;
  titleMode: 'client' | 'complaint';
  onOpen: () => void;
}) {
  const tone = STATUS_TONE[ep.status] || STATUS_TONE.active;

  const title = titleMode === 'client'
    ? (ep.client?.name || '未知来访者')
    : (ep.chiefComplaint || '未填写主诉');

  // For nested rows we don't repeat the chief complaint as description; for top-
  // level singles, we put the chief complaint in description.
  const description = titleMode === 'client' ? ep.chiefComplaint : undefined;

  // Meta: session count + next appointment
  const meta: DeliveryCardData['meta'] = [];
  meta.push({ label: '会谈', value: `${ep.sessionCount ?? 0} 次` });
  if (ep.nextAppointment) {
    meta.push({ label: '下次', value: formatNextTime(ep.nextAppointment) });
  } else if (ep.status === 'active') {
    meta.push('未预约');
  }

  return (
    <DeliveryCard
      data={{
        id: ep.id,
        kind: 'counseling',
        title,
        status: mapEpisodeStatus(ep.status),
        description,
        meta,
      }}
      onOpen={onOpen}
      statusText={tone.text}
      statusClassName={tone.cls}
    />
  );
}

function formatNextTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.floor(diff / 86400000);

  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  if (days === 0) return `今天 ${time}`;
  if (days === 1) return `明天 ${time}`;
  if (days < 7) return `${days}天后 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}


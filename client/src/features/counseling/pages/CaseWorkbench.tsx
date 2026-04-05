import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEpisodes } from '../../../api/useCounseling';
import { PageLoading, EmptyState } from '../../../shared/components';
import { Search, Plus, Calendar, Hash, ChevronDown, ChevronRight, User } from 'lucide-react';

const statusLabels: Record<string, string> = {
  active: '进行中', paused: '暂停', closed: '已结案', archived: '已归档',
};

type StatusFilter = 'all' | 'active' | 'closed';

export function CaseWorkbench() {
  const navigate = useNavigate();
  const { data: episodes, isLoading } = useEpisodes();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = (episodes || [])
    .filter((ep: any) => {
      if (statusFilter === 'active') return ep.status === 'active' || ep.status === 'paused';
      if (statusFilter === 'closed') return ep.status === 'closed' || ep.status === 'archived';
      return true;
    })
    .filter((ep: any) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        ep.client?.name?.toLowerCase().includes(s) ||
        ep.chiefComplaint?.toLowerCase().includes(s)
      );
    });

  const counts = {
    all: episodes?.length || 0,
    active: episodes?.filter((e: any) => e.status === 'active' || e.status === 'paused').length || 0,
    closed: episodes?.filter((e: any) => e.status === 'closed' || e.status === 'archived').length || 0,
  };

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

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名或主诉"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {([
            { key: 'all' as const, label: `全部 (${counts.all})` },
            { key: 'active' as const, label: `进行中 (${counts.active})` },
            { key: 'closed' as const, label: `已结案 (${counts.closed})` },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                statusFilter === tab.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Episode list grouped by client */}
      {isLoading ? (
        <PageLoading />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search || statusFilter !== 'all' ? '未找到匹配的个案' : '暂无个案'}
          action={!search && statusFilter === 'all' ? { label: '+ 新建个案', onClick: () => navigate('/episodes/new') } : undefined}
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
      if (next.has(clientId)) next.delete(clientId); else next.add(clientId);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const isMulti = group.episodes.length > 1;
        const isCollapsed = collapsed.has(group.clientId);

        if (!isMulti) {
          // Single episode: render flat card (same as before)
          const ep = group.episodes[0];
          return <EpisodeCard key={ep.id} ep={ep} navigate={navigate} />;
        }

        // Multi-episode: render as collapsible group
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
              <div className="border-t border-slate-100">
                {group.episodes.map((ep) => (
                  <EpisodeCard key={ep.id} ep={ep} navigate={navigate} nested />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EpisodeCard({ ep, navigate, nested }: { ep: any; navigate: (path: string) => void; nested?: boolean }) {
  return (
    <button
      onClick={() => navigate(`/episodes/${ep.id}`)}
      className={`w-full text-left hover:bg-slate-50 transition ${
        nested
          ? 'px-4 py-3 border-b border-slate-50 last:border-b-0 pl-11'
          : 'bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {!nested && (
              <span className="text-sm font-semibold text-slate-900">
                {ep.client?.name || '未知来访者'}
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              ep.status === 'active' ? 'bg-blue-50 text-blue-700' :
              ep.status === 'closed' ? 'bg-slate-100 text-slate-500' :
              'bg-yellow-50 text-yellow-700'
            }`}>
              {statusLabels[ep.status] || ep.status}
            </span>
          </div>
          {ep.chiefComplaint && (
            <p className="text-sm text-slate-500 mt-1 truncate">{ep.chiefComplaint}</p>
          )}
        </div>

        <div className="flex items-center gap-4 flex-shrink-0 ml-4">
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Hash className="w-3 h-3" />
            <span>{ep.sessionCount ?? 0} 次</span>
          </div>
          {ep.nextAppointment ? (
            <div className="flex items-center gap-1 text-xs text-brand-600">
              <Calendar className="w-3 h-3" />
              <span>{formatNextTime(ep.nextAppointment)}</span>
            </div>
          ) : ep.status === 'active' ? (
            <div className="flex items-center gap-1 text-xs text-slate-300">
              <Calendar className="w-3 h-3" />
              <span>未预约</span>
            </div>
          ) : null}
        </div>
      </div>
    </button>
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

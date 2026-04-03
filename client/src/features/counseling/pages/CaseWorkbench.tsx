import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEpisodes } from '../../../api/useCounseling';
import { PageLoading, EmptyState, RiskBadge } from '../../../shared/components';
import { Search, Plus, Filter } from 'lucide-react';

const interventionLabels: Record<string, string> = {
  course: '课程', group: '团辅', counseling: '个咨', referral: '转介',
};

const statusLabels: Record<string, string> = {
  active: '进行中', paused: '暂停', closed: '已结案', archived: '已归档',
};

type StatusFilter = 'all' | 'active' | 'closed';
type RiskFilter = 'all' | 'level_1' | 'level_2' | 'level_3' | 'level_4';

export function CaseWorkbench() {
  const navigate = useNavigate();
  const { data: episodes, isLoading } = useEpisodes();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');

  const filtered = (episodes || [])
    .filter((ep) => {
      if (statusFilter === 'active') return ep.status === 'active' || ep.status === 'paused';
      if (statusFilter === 'closed') return ep.status === 'closed' || ep.status === 'archived';
      return true;
    })
    .filter((ep) => riskFilter === 'all' || ep.currentRisk === riskFilter)
    .filter((ep) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        ep.client?.name?.toLowerCase().includes(s) ||
        ep.chiefComplaint?.toLowerCase().includes(s)
      );
    });

  const counts = {
    all: episodes?.length || 0,
    active: episodes?.filter((e) => e.status === 'active' || e.status === 'paused').length || 0,
    closed: episodes?.filter((e) => e.status === 'closed' || e.status === 'archived').length || 0,
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
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1">
          {([
            { key: 'all' as const, label: `全部 (${counts.all})` },
            { key: 'active' as const, label: `进行中 (${counts.active})` },
            { key: 'closed' as const, label: `已结案 (${counts.closed})` },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                statusFilter === tab.key
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">全部风险等级</option>
            <option value="level_1">一般</option>
            <option value="level_2">关注</option>
            <option value="level_3">严重</option>
            <option value="level_4">危机</option>
          </select>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索姓名或主诉"
              className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      </div>

      {/* Episode list */}
      {isLoading ? (
        <PageLoading />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search || statusFilter !== 'all' || riskFilter !== 'all' ? '未找到匹配的个案' : '暂无个案'}
          action={!search && statusFilter === 'all' ? { label: '+ 新建个案', onClick: () => navigate('/episodes/new') } : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((ep) => (
            <button
              key={ep.id}
              onClick={() => navigate(`/episodes/${ep.id}`)}
              className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-brand-300 hover:shadow-sm transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {ep.client?.name || '未知来访者'}
                      </span>
                      <RiskBadge level={ep.currentRisk} />
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        ep.status === 'active' ? 'bg-blue-50 text-blue-700' :
                        ep.status === 'closed' ? 'bg-slate-100 text-slate-500' :
                        'bg-yellow-50 text-yellow-700'
                      }`}>
                        {statusLabels[ep.status] || ep.status}
                      </span>
                      {ep.interventionType && (
                        <span className="text-xs text-slate-400">
                          {interventionLabels[ep.interventionType] || ep.interventionType}
                        </span>
                      )}
                    </div>
                    {ep.chiefComplaint && (
                      <p className="text-sm text-slate-500 mt-1">{ep.chiefComplaint}</p>
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate-400 flex-shrink-0">
                  {new Date(ep.openedAt || ep.createdAt).toLocaleDateString('zh-CN')}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

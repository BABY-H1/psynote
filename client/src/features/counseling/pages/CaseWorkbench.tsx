import React, { useState } from 'react';
import {
  useEpisodes, useEpisode, useTimeline, useCreateEpisode, useCloseEpisode, useConfirmTriage,
  useOrgMembers,
} from '../../../api/useCounseling';
import { Timeline } from '../components/Timeline';
import { AppointmentForm } from '../components/AppointmentForm';
import { SessionNoteForm } from '../components/SessionNoteForm';
import { PageLoading, EmptyState, RiskBadge, useToast } from '../../../shared/components';
import type { CareEpisode } from '@psynote/shared';

const interventionLabels: Record<string, string> = {
  course: '课程',
  group: '团辅',
  counseling: '个咨',
  referral: '转介',
};

const statusLabels: Record<string, string> = {
  active: '进行中',
  paused: '暂停',
  closed: '已结案',
  archived: '已归档',
};

export function CaseWorkbench() {
  const { data: episodes, isLoading } = useEpisodes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="flex gap-6 h-[calc(100vh-5rem)]">
      {/* Left: episode list */}
      <div className="w-80 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">个案管理</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="text-sm text-brand-600 hover:underline"
          >
            + 新建
          </button>
        </div>

        {showCreate && (
          <CreateEpisodeForm
            onClose={() => setShowCreate(false)}
            onCreated={(id) => { setShowCreate(false); setSelectedId(id); }}
          />
        )}

        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? (
            <PageLoading />
          ) : !episodes || episodes.length === 0 ? (
            <EmptyState title="暂无个案" action={{ label: '+ 新建', onClick: () => setShowCreate(true) }} />
          ) : (
            episodes.map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => setSelectedId(ep.id)}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    selectedId === ep.id
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 text-sm truncate">
                      {ep.client?.name || '未知来访者'}
                    </span>
                    <RiskBadge level={ep.currentRisk} />
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <span>{statusLabels[ep.status] || ep.status}</span>
                    {ep.interventionType && (
                      <>
                        <span>|</span>
                        <span>{interventionLabels[ep.interventionType] || ep.interventionType}</span>
                      </>
                    )}
                  </div>
                  {ep.chiefComplaint && (
                    <p className="text-xs text-slate-500 mt-1 truncate">{ep.chiefComplaint}</p>
                  )}
                </button>
              ))
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selectedId ? (
          <EpisodeDetail episodeId={selectedId} />
        ) : (
          <EmptyState title="从左侧选择一个个案" />
        )}
      </div>
    </div>
  );
}

function EpisodeDetail({ episodeId }: { episodeId: string }) {
  const { data: episode } = useEpisode(episodeId);
  const { data: timeline, isLoading: timelineLoading } = useTimeline(episodeId);
  const closeEpisode = useCloseEpisode();
  const confirmTriage = useConfirmTriage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'timeline' | 'appointment' | 'soap'>('timeline');

  if (!episode) {
    return <PageLoading />;
  }

  const tabs = [
    { key: 'timeline' as const, label: '时间线' },
    { key: 'appointment' as const, label: '新建预约' },
    { key: 'soap' as const, label: '写 SOAP' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-slate-900">
                {episode.client?.name || '未知来访者'}
              </h3>
              <RiskBadge level={episode.currentRisk} />
              {episode.interventionType && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {interventionLabels[episode.interventionType] || episode.interventionType}
                </span>
              )}
              <span className="text-xs text-slate-400">
                {statusLabels[episode.status] || episode.status}
              </span>
            </div>
            {episode.chiefComplaint && (
              <p className="text-sm text-slate-500 mt-1">{episode.chiefComplaint}</p>
            )}
          </div>
          <div className="flex gap-2">
            {episode.status === 'active' && (
              <button
                onClick={async () => {
                  if (confirm('确定结案？')) {
                    await closeEpisode.mutateAsync({ episodeId: episode.id });
                    toast('已成功结案', 'success');
                  }
                }}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
              >
                结案
              </button>
            )}
          </div>
        </div>

        {/* Triage quick action */}
        {episode.status === 'active' && (
          <TriageBar
            episodeId={episode.id}
            currentRisk={episode.currentRisk}
            currentIntervention={episode.interventionType || null}
            onConfirm={async (data) => {
              await confirmTriage.mutateAsync(data);
              toast('分流已更新', 'success');
            }}
          />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab.key
                ? 'bg-brand-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'timeline' && (
        <Timeline events={timeline || []} isLoading={timelineLoading} />
      )}
      {activeTab === 'appointment' && (
        <AppointmentForm
          episodeId={episode.id}
          clientId={episode.clientId}
          onDone={() => setActiveTab('timeline')}
        />
      )}
      {activeTab === 'soap' && (
        <SessionNoteForm
          episodeId={episode.id}
          clientId={episode.clientId}
          onDone={() => setActiveTab('timeline')}
        />
      )}
    </div>
  );
}

function TriageBar({
  episodeId,
  currentRisk,
  currentIntervention,
  onConfirm,
}: {
  episodeId: string;
  currentRisk: string;
  currentIntervention: string | null;
  onConfirm: (data: { episodeId: string; currentRisk: string; interventionType: string; note?: string }) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [risk, setRisk] = useState(currentRisk);
  const [intervention, setIntervention] = useState(currentIntervention || 'counseling');

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-3 text-xs text-brand-600 hover:underline"
      >
        调整分流
      </button>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
      <select
        value={risk}
        onChange={(e) => setRisk(e.target.value)}
        className="px-2 py-1 border border-slate-200 rounded text-xs"
      >
        <option value="level_1">一级（一般）</option>
        <option value="level_2">二级（关注）</option>
        <option value="level_3">三级（严重）</option>
        <option value="level_4">四级（危机）</option>
      </select>
      <select
        value={intervention}
        onChange={(e) => setIntervention(e.target.value)}
        className="px-2 py-1 border border-slate-200 rounded text-xs"
      >
        <option value="course">课程</option>
        <option value="group">团辅</option>
        <option value="counseling">个咨</option>
        <option value="referral">转介</option>
      </select>
      <button
        onClick={async () => {
          await onConfirm({ episodeId, currentRisk: risk, interventionType: intervention });
          setEditing(false);
        }}
        className="px-3 py-1 bg-brand-600 text-white rounded text-xs hover:bg-brand-500"
      >
        确认
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-xs text-slate-400 hover:text-slate-600"
      >
        取消
      </button>
    </div>
  );
}

function CreateEpisodeForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const createEpisode = useCreateEpisode();
  const { data: members } = useOrgMembers();
  const { toast } = useToast();
  const [clientId, setClientId] = useState('');
  const [complaint, setComplaint] = useState('');

  const clients = members?.filter((m) => m.role === 'client') || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      toast('请选择来访者', 'error');
      return;
    }
    try {
      const episode = await createEpisode.mutateAsync({
        clientId,
        chiefComplaint: complaint || undefined,
      });
      toast('个案创建成功', 'success');
      onCreated(episode.id);
    } catch {
      toast('创建失败，请重试', 'error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-4 mb-3 space-y-3">
      <div>
        <label className="block text-xs text-slate-500 mb-1">来访者</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">请选择来访者</option>
          {clients.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.name || c.email}
            </option>
          ))}
        </select>
        {clients.length === 0 && members && (
          <p className="text-xs text-amber-500 mt-1">暂无来访者，请先在机构中添加来访者成员</p>
        )}
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">主诉（可选）</label>
        <input
          placeholder="简要描述来访原因"
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
          取消
        </button>
        <button
          type="submit"
          disabled={createEpisode.isPending || !clientId}
          className="px-4 py-1.5 bg-brand-600 text-white rounded-lg text-xs hover:bg-brand-500 disabled:opacity-50"
        >
          {createEpisode.isPending ? '创建中...' : '创建'}
        </button>
      </div>
    </form>
  );
}

import React, { useMemo, useState } from 'react';
import {
  useGroupInstances,
  useUpdateGroupInstance, useDeleteGroupInstance,
} from '../../../api/useGroups';
import {
  PageLoading,
  useToast,
  StatusFilterTabs,
  CardGrid,
  DeliveryCard,
  EmptyCard,
  getFiltersForKind,
  type StatusFilterOption,
  type DeliveryCardData,
} from '../../../shared/components';
import { GroupInstanceDetail } from '../components/GroupInstanceDetail';
import { GroupWizard } from './group-wizard/GroupWizard';
import { Plus, Search, Play, PauseCircle, PlayCircle, Send, Edit3, Archive, Trash2, X, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { GroupInstance, ServiceStatus } from '@psynote/shared';

/**
 * Phase 4a — GroupCenter migrated to Phase 2 shared components.
 *
 * Visual & behavioural changes from the previous version:
 *  - Status filter row → `<StatusFilterTabs>` with count badges (computed from
 *    the unfiltered list, since we now fetch once and filter client-side).
 *  - Card layout → `<CardGrid>` + `<DeliveryCard>` with the action buttons in
 *    the `actions` slot.
 *  - Empty state → `<EmptyCard>` with a "+ 发布活动" CTA.
 *
 * Behaviour preserved:
 *  - Recruit toggle, share modal, edit (open detail), delete (with confirm)
 *  - "full" status keeps its yellow "已满" badge via DeliveryCard overrides
 *  - Search by title, status filter
 *  - View transitions (list / create / detail) unchanged
 */

/** Map GroupStatus → ServiceStatus, keeping room for the "full" override below. */
function mapGroupStatus(s: GroupInstance['status']): ServiceStatus {
  switch (s) {
    case 'draft':
      return 'draft';
    case 'recruiting':
      return 'recruiting';
    case 'ongoing':
      return 'ongoing';
    case 'full':
      // Best-fit ServiceStatus; the "已满" label is restored via statusText override.
      return 'ongoing';
    case 'ended':
      return 'archived';
    case 'paused':
      return 'paused';
    case 'archived':
      return 'archived';
    default:
      return 'draft';
  }
}

/** Map DB group status → unified filter key */
function groupStatusToFilterKey(dbStatus: string): import('../../../shared/components').UnifiedFilterKey {
  switch (dbStatus) {
    case 'draft':      return 'draft';
    case 'recruiting': return 'recruiting';
    case 'ongoing':    return 'ongoing';
    case 'full':       return 'ongoing';
    case 'ended':      return 'archived';
    case 'paused':     return 'paused';
    case 'archived':   return 'archived';
    default:           return 'draft';
  }
}

const GROUP_FILTERS = getFiltersForKind('group');

type ViewMode = 'list' | 'create' | 'detail';

export function GroupCenter() {
  const [view, setView] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [shareModalId, setShareModalId] = useState<string | null>(null);

  // Phase 4a — fetch once (no server-side status filter), apply filtering client-side
  // so we can also compute count badges for the StatusFilterTabs.
  const { data: instances, isLoading } = useGroupInstances();
  const updateInstance = useUpdateGroupInstance();
  const deleteInstance = useDeleteGroupInstance();
  const { toast } = useToast();

  // Status counts for badges (always reflect ALL instances, not the filtered subset)
  const statusOptions = useMemo<StatusFilterOption[]>(() => {
    const all = instances ?? [];
    const counts: Record<string, number> = {};
    for (const inst of all) {
      const key = groupStatusToFilterKey(inst.status);
      counts[key] = (counts[key] || 0) + 1;
    }
    return GROUP_FILTERS.map((f) => ({
      value: f.key,
      label: f.label,
      count: f.key === '' ? all.length : counts[f.key] || 0,
      countTone: 'slate' as const,
    }));
  }, [instances]);

  // Apply status + search filter on the client
  const filteredInstances = useMemo(() => {
    let arr = instances ?? [];
    if (statusFilter) arr = arr.filter((i) => groupStatusToFilterKey(i.status) === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((i) => i.title.toLowerCase().includes(q));
    }
    return arr;
  }, [instances, statusFilter, search]);

  if (view === 'detail' && selectedId) {
    return <GroupInstanceDetail instanceId={selectedId} onClose={() => { setView('list'); setSelectedId(null); }} />;
  }

  if (view === 'create') {
    return <GroupWizard onClose={() => setView('list')} onCreated={(id) => { setSelectedId(id); setView('detail'); }} />;
  }

  return (
    <div>
      {/* Toolbar: search + StatusFilterTabs + 发布 CTA — all on one row
          (Phase 14e: title moved to DeliveryCenter tab label; CTA pinned to the right). */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索活动..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <StatusFilterTabs options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
        <button
          onClick={() => setView('create')}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition"
        >
          <Plus className="w-4 h-4" />
          发布活动
        </button>
      </div>

      {/* Instance List */}
      {isLoading ? (
        <PageLoading />
      ) : filteredInstances.length === 0 ? (
        <EmptyCard
          title={search || statusFilter ? '没有匹配的团辅活动' : '暂无团辅活动'}
          description={search || statusFilter ? '尝试调整筛选或搜索词' : '点击右上角发布第一个活动'}
          action={!search && !statusFilter ? { label: '+ 发布活动', onClick: () => setView('create') } : undefined}
        />
      ) : (
        <CardGrid cols={2}>
          {filteredInstances.map((inst) => {
            const uKey = groupStatusToFilterKey(inst.status);
            const isDraft = uKey === 'draft';
            const isActive = uKey === 'recruiting' || uKey === 'ongoing';
            const isPaused = uKey === 'paused';
            const isArchived = uKey === 'archived';

            const cardData: DeliveryCardData = {
              id: inst.id,
              kind: 'group',
              title: inst.title,
              status: mapGroupStatus(inst.status),
              description: inst.description,
              meta: [
                ...(inst.startDate ? [inst.startDate] : []),
                ...(inst.location ? [inst.location] : []),
                ...(inst.capacity ? [{ label: '容量', value: inst.capacity }] : []),
              ],
            };

            return (
              <DeliveryCard
                key={inst.id}
                data={cardData}
                onOpen={() => { setSelectedId(inst.id); setView('detail'); }}
                statusText={inst.status === 'full' ? '已满' : undefined}
                statusClassName={inst.status === 'full' ? 'bg-yellow-100 text-yellow-700' : undefined}
                actions={
                  <>
                    {/* 编辑（非归档） */}
                    {!isArchived && (
                      <button
                        onClick={() => { setSelectedId(inst.id); setView('detail'); }}
                        className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                        title="编辑"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    {/* 发布（仅草稿） */}
                    {isDraft && (
                      <button
                        onClick={() => updateInstance.mutate(
                          { instanceId: inst.id, status: 'recruiting' },
                          { onSuccess: () => toast('已发布招募', 'success') },
                        )}
                        className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                        title="发布招募"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {/* 分享链接（招募中/进行中） */}
                    {isActive && (
                      <button
                        onClick={() => setShareModalId(inst.id)}
                        className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                        title="分享链接"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    {/* 暂停（招募中/进行中） */}
                    {isActive && (
                      <button
                        onClick={() => updateInstance.mutate(
                          { instanceId: inst.id, status: 'paused' },
                          { onSuccess: () => toast('已暂停', 'success') },
                        )}
                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                        title="暂停"
                      >
                        <PauseCircle className="w-4 h-4" />
                      </button>
                    )}
                    {/* 恢复（已暂停） */}
                    {isPaused && (
                      <button
                        onClick={() => updateInstance.mutate(
                          { instanceId: inst.id, status: 'ongoing' },
                          { onSuccess: () => toast('已恢复', 'success') },
                        )}
                        className="p-2 text-amber-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                        title="恢复"
                      >
                        <PlayCircle className="w-4 h-4" />
                      </button>
                    )}
                    {/* 归档（进行中/已暂停） */}
                    {(uKey === 'ongoing' || isPaused) && (
                      <button
                        onClick={() => {
                          if (confirm('确定归档此团辅活动？归档后不可恢复。')) {
                            updateInstance.mutate(
                              { instanceId: inst.id, status: 'ended' },
                              { onSuccess: () => toast('已归档', 'success') },
                            );
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                        title="归档"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}
                    {/* 删除（任何状态） */}
                    <button
                      onClick={() => {
                        if (confirm('确定删除此团辅活动？相关的报名和出勤记录也将被删除。')) {
                          deleteInstance.mutate(inst.id, {
                            onSuccess: () => toast('已删除', 'success'),
                            onError: (err: any) => toast(err.message || '删除失败', 'error'),
                          });
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                }
              />
            );
          })}
        </CardGrid>
      )}

      {/* Share Modal */}
      {shareModalId && (
        <RecruitmentShareModal instanceId={shareModalId} onClose={() => setShareModalId(null)} />
      )}
    </div>
  );
}

function RecruitmentShareModal({ instanceId, onClose }: { instanceId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const enrollUrl = `${window.location.origin}/enroll/${instanceId}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(enrollUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">招募链接</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-4">
          分享以下链接或二维码，来访者无需登录即可查看活动介绍并报名。
        </p>

        {/* Link */}
        <div className="flex items-center gap-2 mb-4">
          <input
            readOnly
            value={enrollUrl}
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 truncate"
          />
          <button
            onClick={handleCopy}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
              copied ? 'bg-green-100 text-green-700' : 'bg-brand-600 text-white hover:bg-brand-500'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* QR Code */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 flex flex-col items-center">
          <div className="bg-white p-3 rounded-xl shadow-sm">
            <QRCodeSVG value={enrollUrl} size={160} level="M" />
          </div>
          <p className="text-xs text-slate-400 mt-3">扫描二维码报名</p>
        </div>
      </div>
    </div>
  );
}


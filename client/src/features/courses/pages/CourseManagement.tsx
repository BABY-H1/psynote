import React, { useMemo, useState } from 'react';
import {
  useCourseInstances,
  useDeleteCourseInstance,
  useActivateCourseInstance,
  useCloseCourseInstance,
  useArchiveCourseInstance,
} from '../../../api/useCourseInstances';
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
import { CourseInstanceDetail } from '../components/CourseInstanceDetail';
import { CourseWizard } from './course-wizard/CourseWizard';
import {
  Plus, Search, Trash2, Play, PauseCircle, PlayCircle, Send, Edit3, Archive, X, Copy, Check,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { ServiceStatus } from '@psynote/shared';

/**
 * Phase 4b — CourseManagement migrated to Phase 2 shared components.
 *
 *  - Status filter row → `<StatusFilterTabs>` with count badges (computed from
 *    a single unfiltered fetch + client-side filter, like Phase 4a Groups).
 *  - Card layout → `<CardGrid cols={3}>` + `<DeliveryCard>`. Action buttons
 *    (查看详情 / 分享报名 / 激活 / 关闭 / 删除) are passed via `actions` slot.
 *  - Empty state → `<EmptyCard>`.
 *  - Stats cards (4 tiles) and `ShareEnrollModal` are kept unchanged.
 *
 * Status mapping (course → ServiceStatus):
 *   draft     → draft
 *   active    → ongoing  (so default text "进行中" is reused)
 *   closed    → closed   (label overridden to "已关闭" + amber)
 *   archived  → archived
 */

const publishModeLabels: Record<string, string> = {
  assign: '指定学员',
  class: '按班级',
  public: '公开报名',
};

function mapCourseStatus(s: string): ServiceStatus {
  switch (s) {
    case 'draft':
      return 'draft';
    case 'active':
      return 'ongoing';
    case 'closed':
      return 'paused';
    case 'archived':
      return 'archived';
    default:
      return 'draft';
  }
}

/** Map DB course status → unified filter key */
function courseStatusToFilterKey(dbStatus: string): import('../../../shared/components').UnifiedFilterKey {
  switch (dbStatus) {
    case 'draft':    return 'draft';
    case 'active':   return 'ongoing';
    case 'closed':   return 'paused';
    case 'archived': return 'archived';
    default:         return 'draft';
  }
}

const COURSE_FILTERS = getFiltersForKind('course');

// ─── Main Component ─────────────────────────────────────────────

type ViewMode = 'list' | 'create' | 'detail';

const DELIVERY_COPY = {
  title: '课程交付中心',
  subtitle: '管理课程实例、招生发布与学员学习',
  create: '创建实例',
};

export function CourseManagement() {
  const [view, setView] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [shareModalId, setShareModalId] = useState<string | null>(null);

  // Phase 4b — fetch once (no server-side status filter), apply filtering client-side
  // so we can also compute count badges for the StatusFilterTabs.
  const { data: instances, isLoading, error } = useCourseInstances();
  const deleteInstance = useDeleteCourseInstance();
  const activateInstance = useActivateCourseInstance();
  const closeInstance = useCloseCourseInstance();
  const archiveInstance = useArchiveCourseInstance();
  const { toast } = useToast();

  // Status counts for filter badges (always reflect ALL instances).
  const statusOptions = useMemo<StatusFilterOption[]>(() => {
    const all = (instances ?? []) as any[];
    const counts: Record<string, number> = {};
    for (const inst of all) {
      const key = courseStatusToFilterKey(inst.status);
      counts[key] = (counts[key] || 0) + 1;
    }
    return COURSE_FILTERS.map((f) => ({
      value: f.key,
      label: f.label,
      count: f.key === '' ? all.length : counts[f.key] || 0,
      countTone: 'slate' as const,
    }));
  }, [instances]);

  const filteredInstances = useMemo(() => {
    let arr = ((instances as any[]) ?? []).slice();
    if (statusFilter) arr = arr.filter((i) => courseStatusToFilterKey(i.status) === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((i) => (i.title || '').toLowerCase().includes(q));
    }
    return arr;
  }, [instances, statusFilter, search]);

  // ── View switching ──────────────────────────────────────────

  if (view === 'detail' && selectedId) {
    return (
      <CourseInstanceDetail
        instanceId={selectedId}
        onClose={() => { setView('list'); setSelectedId(null); }}
      />
    );
  }

  if (view === 'create') {
    return <CourseWizard onClose={() => setView('list')} />;
  }

  // ── Stats ───────────────────────────────────────────────────


  // ── Handlers ────────────────────────────────────────────────

  const handleActivate = (id: string) => {
    activateInstance.mutate(id, {
      onSuccess: () => toast('课程已激活', 'success'),
      onError: (err: any) => toast(err.message || '激活失败', 'error'),
    });
  };

  const handleClose = (id: string) => {
    closeInstance.mutate(id, {
      onSuccess: () => toast('课程已关闭', 'success'),
      onError: (err: any) => toast(err.message || '关闭失败', 'error'),
    });
  };

  const handleDelete = (id: string) => {
    if (confirm('确定删除此课程实例？相关的学员记录和学习进度也将被删除。')) {
      deleteInstance.mutate(id, {
        onSuccess: () => toast('已删除', 'success'),
        onError: (err: any) => toast(err.message || '删除失败', 'error'),
      });
    }
  };

  // ── Render ──────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{DELIVERY_COPY.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{DELIVERY_COPY.subtitle}</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition"
        >
          <Plus className="w-4 h-4" />
          {DELIVERY_COPY.create}
        </button>
      </div>


      {/* Filters: search input + StatusFilterTabs (Phase 4b) */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <StatusFilterTabs options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
        <div className="relative flex-1 max-w-xs min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索课程..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Instance Cards */}
      {isLoading ? (
        <PageLoading />
      ) : error ? (
        <div className="text-center py-12 text-sm text-red-500">
          加载失败，请刷新重试
        </div>
      ) : filteredInstances.length === 0 ? (
        <EmptyCard
          title={search || statusFilter ? '没有匹配的课程实例' : '暂无课程实例'}
          description={search || statusFilter ? '尝试调整筛选或搜索词' : '点击右上角创建第一个课程实例'}
          action={!search && !statusFilter ? { label: '+ 创建实例', onClick: () => setView('create') } : undefined}
        />
      ) : (
        <CardGrid cols={3}>
          {filteredInstances.map((inst: any) => {
            const enrolled = inst.enrollmentCount ?? inst.enrolledCount ?? 0;
            const completionRate = inst.completionRate ?? 0;
            const uKey = courseStatusToFilterKey(inst.status);
            const isDraft = uKey === 'draft';
            const isActive = uKey === 'ongoing';
            const isPaused = uKey === 'paused';
            const isArchived = uKey === 'archived';

            const cardData: DeliveryCardData = {
              id: inst.id,
              kind: 'course',
              title: inst.title,
              status: mapCourseStatus(inst.status),
              description: inst.description,
              meta: [
                ...(inst.publishMode ? [publishModeLabels[inst.publishMode] || inst.publishMode] : []),
                ...(inst.courseType ? [inst.courseType] : []),
                { label: '已加入', value: `${enrolled} 人` },
                ...(isActive ? [{ label: '完成率', value: `${completionRate}%` }] : []),
              ],
            };

            return (
              <DeliveryCard
                key={inst.id}
                data={cardData}
                onOpen={() => { setSelectedId(inst.id); setView('detail'); }}
                statusText={isPaused ? '已暂停' : undefined}
                statusClassName={isPaused ? 'bg-slate-100 text-slate-500' : undefined}
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
                        onClick={() => handleActivate(inst.id)}
                        className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                        title="发布课程"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {/* 分享链接（进行中） */}
                    {isActive && (
                      <button
                        onClick={() => setShareModalId(inst.id)}
                        className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                        title="分享链接"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    {/* 暂停（进行中） */}
                    {isActive && (
                      <button
                        onClick={() => handleClose(inst.id)}
                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                        title="暂停"
                      >
                        <PauseCircle className="w-4 h-4" />
                      </button>
                    )}
                    {/* 恢复（已暂停） */}
                    {isPaused && (
                      <button
                        onClick={() => handleActivate(inst.id)}
                        className="p-2 text-amber-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                        title="恢复"
                      >
                        <PlayCircle className="w-4 h-4" />
                      </button>
                    )}
                    {/* 归档（进行中/已暂停） */}
                    {(isActive || isPaused) && (
                      <button
                        onClick={() => {
                          if (confirm('确定归档此课程？归档后不可恢复。')) {
                            archiveInstance.mutate(inst.id, {
                              onSuccess: () => toast('已归档', 'success'),
                              onError: (err: any) => toast(err.message || '归档失败', 'error'),
                            });
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
                      onClick={() => handleDelete(inst.id)}
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
        <ShareEnrollModal
          instanceId={shareModalId}
          onClose={() => setShareModalId(null)}
        />
      )}
    </div>
  );
}

// ─── Share / Enrollment Link Modal ──────────────────────────────

function ShareEnrollModal({ instanceId, onClose }: { instanceId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const enrollUrl = `${window.location.origin}/course-enroll/${instanceId}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(enrollUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">公开报名链接</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-4">
          分享以下链接或二维码，学员无需登录即可查看课程介绍并报名。
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
          <p className="text-xs text-slate-400 mt-3">扫描二维码报名课程</p>
        </div>
      </div>
    </div>
  );
}

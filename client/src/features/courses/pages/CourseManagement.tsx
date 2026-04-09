import React, { useMemo, useState } from 'react';
import {
  useCourseInstances,
  useDeleteCourseInstance,
  useActivateCourseInstance,
  useCloseCourseInstance,
} from '../../../api/useCourseInstances';
import {
  PageLoading,
  useToast,
  StatusFilterTabs,
  CardGrid,
  DeliveryCard,
  EmptyCard,
  type StatusFilterOption,
  type DeliveryCardData,
} from '../../../shared/components';
import { CourseInstanceDetail } from '../components/CourseInstanceDetail';
import { PublishCourseForm } from '../components/PublishCourseForm';
import {
  Plus, Search, Trash2, Play, Square, Users, BookOpen, BarChart, X, Copy, Check,
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
      return 'closed';
    case 'archived':
      return 'archived';
    default:
      return 'draft';
  }
}

const STATUS_FILTER_KEYS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'active', label: '进行中' },
  { key: 'closed', label: '已关闭' },
  { key: 'archived', label: '已归档' },
];

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
  const { toast } = useToast();

  // Status counts for filter badges (always reflect ALL instances).
  const statusOptions = useMemo<StatusFilterOption[]>(() => {
    const all = (instances ?? []) as any[];
    const counts: Record<string, number> = {};
    for (const inst of all) counts[inst.status] = (counts[inst.status] || 0) + 1;
    return STATUS_FILTER_KEYS.map((f) => ({
      value: f.key,
      label: f.label,
      count: f.key === '' ? all.length : counts[f.key] || 0,
      countTone: 'slate' as const,
    }));
  }, [instances]);

  const filteredInstances = useMemo(() => {
    let arr = ((instances as any[]) ?? []).slice();
    if (statusFilter) arr = arr.filter((i) => i.status === statusFilter);
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
    return <PublishCourseForm onClose={() => setView('list')} />;
  }

  // ── Stats ───────────────────────────────────────────────────

  const totalInstances = instances?.length ?? 0;
  const activeCount = instances?.filter((i: any) => i.status === 'active').length ?? 0;
  const totalEnrolled =
    instances?.reduce(
      (sum: number, i: any) => sum + (i.enrollmentCount ?? i.enrolledCount ?? 0),
      0,
    ) ?? 0;
  const avgCompletion = totalInstances > 0
    ? Math.round(
        instances!.reduce((sum: number, i: any) => sum + (i.completionRate ?? 0), 0) / totalInstances,
      )
    : 0;

  const stats = [
    { label: '课程实例', value: totalInstances, icon: BookOpen, bg: 'bg-purple-50', iconColor: 'text-purple-500' },
    { label: '进行中', value: activeCount, icon: Play, bg: 'bg-blue-50', iconColor: 'text-blue-500' },
    { label: '学员总数', value: totalEnrolled, icon: Users, bg: 'bg-green-50', iconColor: 'text-green-500' },
    { label: '平均完成率', value: `${avgCompletion}%`, icon: BarChart, bg: 'bg-amber-50', iconColor: 'text-amber-500' },
  ];

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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3`}>
            <div className={`w-10 h-10 rounded-lg bg-white/70 flex items-center justify-center ${s.iconColor}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="text-lg font-bold text-slate-900">{s.value}</p>
            </div>
          </div>
        ))}
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
            const isClosed = inst.status === 'closed';

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
                ...(inst.status === 'active' ? [{ label: '完成率', value: `${completionRate}%` }] : []),
              ],
            };

            return (
              <DeliveryCard
                key={inst.id}
                data={cardData}
                onOpen={() => { setSelectedId(inst.id); setView('detail'); }}
                statusText={isClosed ? '已关闭' : undefined}
                statusClassName={isClosed ? 'bg-amber-100 text-amber-700' : undefined}
                actions={
                  <>
                    {/* Share link for public mode (active only) */}
                    {inst.publishMode === 'public' && inst.status === 'active' && (
                      <button
                        onClick={() => setShareModalId(inst.id)}
                        className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                        title="分享报名链接"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                    {/* Activate (draft only) */}
                    {inst.status === 'draft' && (
                      <button
                        onClick={() => handleActivate(inst.id)}
                        className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                        title="激活课程"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {/* Close (active only) */}
                    {inst.status === 'active' && (
                      <button
                        onClick={() => handleClose(inst.id)}
                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                        title="关闭课程"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                    )}
                    {/* Delete (draft only) */}
                    {inst.status === 'draft' && (
                      <button
                        onClick={() => handleDelete(inst.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
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

import React, { useState } from 'react';
import {
  useCourseInstances,
  useDeleteCourseInstance,
  useActivateCourseInstance,
  useCloseCourseInstance,
} from '../../../api/useCourseInstances';
import { PageLoading, EmptyState, useToast } from '../../../shared/components';
import { CourseInstanceDetail } from '../components/CourseInstanceDetail';
import { PublishCourseForm } from '../components/PublishCourseForm';
import {
  Plus, Search, Trash2, Play, Square, Archive, Users, BookOpen, BarChart, X, Copy, Check,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

// ─── Status / Label Config ──────────────────────────────────────

const statusLabels: Record<string, { text: string; color: string }> = {
  draft: { text: '草稿', color: 'bg-slate-100 text-slate-600' },
  active: { text: '进行中', color: 'bg-blue-100 text-blue-700' },
  closed: { text: '已关闭', color: 'bg-amber-100 text-amber-700' },
  archived: { text: '已归档', color: 'bg-slate-100 text-slate-500' },
};

const statusStripeColors: Record<string, string> = {
  draft: 'bg-slate-300',
  active: 'bg-blue-500',
  closed: 'bg-amber-500',
  archived: 'bg-slate-400',
};

const publishModeLabels: Record<string, string> = {
  assign: '指定学员',
  class: '按班级',
  public: '公开报名',
};

const statusFilters = [
  { value: '', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'active', label: '进行中' },
  { value: 'closed', label: '已关闭' },
  { value: 'archived', label: '已归档' },
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

  const { data: instances, isLoading, error } = useCourseInstances(
    statusFilter || undefined ? { status: statusFilter || undefined } : undefined,
  );
  const deleteInstance = useDeleteCourseInstance();
  const activateInstance = useActivateCourseInstance();
  const closeInstance = useCloseCourseInstance();
  const { toast } = useToast();

  const filteredInstances = instances?.filter((inst: any) =>
    !search || inst.title?.toLowerCase().includes(search.toLowerCase()),
  );

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

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                statusFilter === f.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
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
      ) : !filteredInstances || filteredInstances.length === 0 ? (
        <EmptyState title="暂无课程实例" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredInstances.map((inst: any) => {
            const st = statusLabels[inst.status] || statusLabels.draft;
            const stripe = statusStripeColors[inst.status] || statusStripeColors.draft;
            const enrolled = inst.enrollmentCount ?? inst.enrolledCount ?? 0;
            const completionRate = inst.completionRate ?? 0;

            return (
              <div
                key={inst.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md hover:border-slate-300 transition group"
              >
                {/* Color strip */}
                <div className={`h-1.5 ${stripe}`} />

                <div className="p-5">
                  {/* Status badge + title */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <button
                      onClick={() => { setSelectedId(inst.id); setView('detail'); }}
                      className="text-left flex-1 min-w-0"
                    >
                      <h3 className="font-semibold text-slate-900 truncate group-hover:text-brand-600 transition">
                        {inst.title}
                      </h3>
                    </button>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${st.color}`}>
                      {st.text}
                    </span>
                  </div>

                  {/* Meta: publish mode + course type */}
                  <div className="flex items-center gap-2 mb-2 text-xs text-slate-400">
                    {inst.publishMode && (
                      <span className="px-1.5 py-0.5 bg-slate-50 rounded text-slate-500">
                        {publishModeLabels[inst.publishMode] || inst.publishMode}
                      </span>
                    )}
                    {inst.courseType && (
                      <span className="px-1.5 py-0.5 bg-slate-50 rounded text-slate-500">
                        {inst.courseType}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {inst.description && (
                    <p className="text-sm text-slate-500 line-clamp-2 mb-3">{inst.description}</p>
                  )}

                  <div className="border-t border-slate-100 pt-3 mt-3">
                    {/* Enrolled count + progress */}
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {enrolled} 人已加入
                      </span>
                      {inst.status === 'active' && (
                        <span>{completionRate}% 完成</span>
                      )}
                    </div>

                    {/* Progress bar (active only) */}
                    {inst.status === 'active' && (
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${Math.min(completionRate, 100)}%` }}
                        />
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setSelectedId(inst.id); setView('detail'); }}
                        className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition font-medium"
                      >
                        查看详情
                      </button>

                      {/* Share link for public mode */}
                      {inst.publishMode === 'public' && inst.status === 'active' && (
                        <button
                          onClick={() => setShareModalId(inst.id)}
                          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                          title="分享报名链接"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Activate (draft only) */}
                      {inst.status === 'draft' && (
                        <button
                          onClick={() => handleActivate(inst.id)}
                          className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                          title="激活课程"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Close (active only) */}
                      {inst.status === 'active' && (
                        <button
                          onClick={() => handleClose(inst.id)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                          title="关闭课程"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Delete (draft only) */}
                      {inst.status === 'draft' && (
                        <button
                          onClick={() => handleDelete(inst.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition ml-auto"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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

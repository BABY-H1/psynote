import React, { useMemo, useState } from 'react';
import { useAssessments, useUpdateAssessment, useDeleteAssessment } from '../../../api/useAssessments';
import { AssessmentWizard } from '../components/AssessmentWizard';
import { AssessmentDetail } from '../components/AssessmentDetail';
import { Search, Plus, PauseCircle, PlayCircle, Edit3, Send, Trash2, X, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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
import { ASSESSMENT_TYPE_LABELS } from '../constants';
import type { Assessment, ServiceStatus } from '@psynote/shared';

/**
 * Phase 4c — AssessmentManagement migrated to Phase 2 shared components.
 *
 *  - Status filter row → `<StatusFilterTabs>` with count badges
 *  - Card layout → `<CardGrid>` + `<DeliveryCard>` (actions slot)
 *  - Empty state → `<EmptyCard>`
 *  - `ShareModal` and view-switching logic preserved
 *
 * Status mapping:
 *   `(status, isActive)` is a tuple in the DB. We collapse it into a synthetic
 *   "logical status" key used both for filtering and for ServiceStatus mapping:
 *
 *     status='draft'                          → 'draft'    → ServiceStatus.draft    (yellow override)
 *     status='archived'                       → 'archived' → ServiceStatus.archived (default)
 *     status≠'draft' && isActive===true       → 'active'   → ServiceStatus.ongoing  (green override)
 *     status≠'draft' && isActive===false      → 'paused'   → ServiceStatus.paused   (slate override + "已停用")
 */

type LogicalStatus = 'draft' | 'active' | 'paused' | 'archived';

function getLogicalStatus(a: Assessment): LogicalStatus {
  if (a.status === 'draft') return 'draft';
  if (a.status === 'archived') return 'archived';
  return a.isActive ? 'active' : 'paused';
}

function mapToServiceStatus(ls: LogicalStatus): ServiceStatus {
  switch (ls) {
    case 'draft':
      return 'draft';
    case 'archived':
      return 'archived';
    case 'active':
      return 'ongoing';
    case 'paused':
      return 'paused';
  }
}

/** Per-status label + className overrides preserving the original assessment palette. */
const STATUS_OVERRIDE: Record<LogicalStatus, { text: string; cls: string }> = {
  draft: { text: '草稿', cls: 'bg-yellow-100 text-yellow-700' },
  active: { text: '进行中', cls: 'bg-green-100 text-green-700' },
  paused: { text: '已停用', cls: 'bg-slate-100 text-slate-500' },
  archived: { text: '已归档', cls: 'bg-slate-100 text-slate-500' },
};

type View =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'edit'; assessmentId: string }
  | { type: 'detail'; assessmentId: string };

const STATUS_FILTER_KEYS: { key: '' | LogicalStatus; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'draft', label: '草稿' },
  { key: 'paused', label: '已停用' },
  { key: 'archived', label: '已归档' },
];

export function AssessmentManagement() {
  const { data: assessments, isLoading } = useAssessments();
  const updateAssessment = useUpdateAssessment();
  const deleteAssessment = useDeleteAssessment();
  const { toast } = useToast();
  const [view, setView] = useState<View>({ type: 'list' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [shareModalId, setShareModalId] = useState<string | null>(null);

  // IMPORTANT: All hooks (including these useMemos) must run on every render,
  // BEFORE any early return. Moving them after the early returns below would
  // cause "Rendered fewer hooks than expected" when switching views.

  // Status counts for filter badges (always reflect ALL assessments)
  const statusOptions = useMemo<StatusFilterOption[]>(() => {
    const all = assessments ?? [];
    const counts: Record<LogicalStatus, number> = { draft: 0, active: 0, paused: 0, archived: 0 };
    for (const a of all) counts[getLogicalStatus(a)]++;
    return STATUS_FILTER_KEYS.map((f) => ({
      value: f.key,
      label: f.label,
      count: f.key === '' ? all.length : counts[f.key],
      countTone: 'slate' as const,
    }));
  }, [assessments]);

  const filtered = useMemo(() => {
    let arr = assessments ?? [];
    if (statusFilter) {
      arr = arr.filter((a) => getLogicalStatus(a) === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.description || '').toLowerCase().includes(q),
      );
    }
    return arr;
  }, [assessments, statusFilter, search]);

  if (view.type === 'create') {
    return (
      <AssessmentWizard
        onClose={() => setView({ type: 'list' })}
        onCreated={(id) => setView({ type: 'detail', assessmentId: id })}
      />
    );
  }

  if (view.type === 'edit') {
    return (
      <AssessmentWizard
        onClose={() => setView({ type: 'list' })}
        onCreated={(id) => setView({ type: 'detail', assessmentId: id })}
        editAssessmentId={view.assessmentId}
      />
    );
  }

  if (view.type === 'detail') {
    return (
      <AssessmentDetail
        assessmentId={view.assessmentId}
        onClose={() => setView({ type: 'list' })}
        onEdit={(id) => setView({ type: 'edit', assessmentId: id })}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">测评管理</h2>
          <p className="text-sm text-slate-500 mt-1">创建和管理测评活动</p>
        </div>
        <button
          onClick={() => setView({ type: 'create' })}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition"
        >
          <Plus className="w-4 h-4" />
          新建测评
        </button>
      </div>

      {/* Search + Filters (Phase 4c) */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索测评..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <StatusFilterTabs options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
      </div>

      {/* Assessment List */}
      {isLoading ? (
        <PageLoading />
      ) : filtered.length === 0 ? (
        <EmptyCard
          title={
            (assessments?.length ?? 0) === 0
              ? '暂无测评'
              : '没有匹配的测评'
          }
          description={
            (assessments?.length ?? 0) === 0
              ? '点击右上角创建第一个测评'
              : '尝试调整筛选或搜索词'
          }
          action={
            (assessments?.length ?? 0) === 0
              ? { label: '+ 新建测评', onClick: () => setView({ type: 'create' }) }
              : undefined
          }
        />
      ) : (
        <CardGrid cols={2}>
          {filtered.map((assessment) => {
            const ls = getLogicalStatus(assessment);
            const ovr = STATUS_OVERRIDE[ls];
            const typeLabel = ASSESSMENT_TYPE_LABELS[(assessment as any).assessmentType] || '';

            const cardData: DeliveryCardData = {
              id: assessment.id,
              kind: 'assessment',
              title: assessment.title,
              status: mapToServiceStatus(ls),
              description: assessment.description,
              meta: [
                ...(typeLabel ? [typeLabel] : []),
                {
                  label: '创建于',
                  value: new Date(assessment.createdAt).toLocaleDateString('zh-CN'),
                },
              ],
            };

            return (
              <DeliveryCard
                key={assessment.id}
                data={cardData}
                onOpen={() => setView({ type: 'detail', assessmentId: assessment.id })}
                statusText={ovr.text}
                statusClassName={ovr.cls}
                actions={
                  <>
                    <button
                      onClick={() =>
                        updateAssessment.mutate(
                          { assessmentId: assessment.id, isActive: !assessment.isActive },
                          { onSuccess: () => toast(assessment.isActive ? '已暂停' : '已启用', 'success') },
                        )
                      }
                      className={`p-2 rounded-lg transition ${
                        assessment.isActive
                          ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                          : 'text-amber-500 hover:text-green-600 hover:bg-green-50'
                      }`}
                      title={assessment.isActive ? '暂停发放' : '恢复发放'}
                    >
                      {assessment.isActive ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setShareModalId(assessment.id)}
                      className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                      title="发放链接"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setView({ type: 'edit', assessmentId: assessment.id })}
                      className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                      title="编辑"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('确定删除此测评？')) {
                          deleteAssessment.mutate(assessment.id, {
                            onSuccess: () => toast('已删除', 'success'),
                            onError: (err) => toast(err.message || '删除失败', 'error'),
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

      {/* Share modal */}
      {shareModalId && (
        <ShareModal assessmentId={shareModalId} onClose={() => setShareModalId(null)} />
      )}
    </div>
  );
}

function ShareModal({ assessmentId, onClose }: { assessmentId: string; onClose: () => void }) {
  const shareUrl = `${window.location.origin}/assess/${assessmentId}`;
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast('链接已复制', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">发放测评</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div>
          <span className="text-sm font-medium text-slate-700 block mb-2">公开链接</span>
          <div className="flex gap-2">
            <input value={shareUrl} readOnly className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 select-all" />
            <button onClick={copyLink} className="px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition flex items-center gap-1.5">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        </div>
        <div>
          <span className="text-sm font-medium text-slate-700 block mb-2">二维码</span>
          <div className="flex justify-center bg-white p-4 border border-slate-100 rounded-lg">
            <QRCodeSVG value={shareUrl} size={180} level="M" />
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">可截图或打印用于线下场景</p>
        </div>
      </div>
    </div>
  );
}

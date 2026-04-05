import React, { useState } from 'react';
import { useAssessments, useUpdateAssessment, useDeleteAssessment } from '../../../api/useAssessments';
import { AssessmentWizard } from '../components/AssessmentWizard';
import { AssessmentDetail } from '../components/AssessmentDetail';
import { Search, Plus, ClipboardCheck, PauseCircle, PlayCircle, Edit3, Send, Trash2, X, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PageLoading, EmptyState, useToast } from '../../../shared/components';
import { ASSESSMENT_TYPE_LABELS } from '../constants';

type View =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'edit'; assessmentId: string }
  | { type: 'detail'; assessmentId: string };

const statusFilters = [
  { value: '', label: '全部' },
  { value: 'active', label: '进行中' },
  { value: 'draft', label: '草稿' },
  { value: 'paused', label: '已停用' },
  { value: 'archived', label: '已归档' },
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

  const filtered = (assessments || []).filter((a) => {
    // Status filter
    if (statusFilter) {
      if (statusFilter === 'active' && !(a.status !== 'draft' && a.isActive)) return false;
      if (statusFilter === 'draft' && a.status !== 'draft') return false;
      if (statusFilter === 'paused' && !(a.status !== 'draft' && !a.isActive && a.status !== 'archived')) return false;
      if (statusFilter === 'archived' && a.status !== 'archived') return false;
    }
    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      return a.title.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q);
    }
    return true;
  });

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

      {/* Search + Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索测评..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
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
      </div>

      {/* Assessment List */}
      {isLoading ? (
        <PageLoading />
      ) : !assessments || assessments.length === 0 ? (
        <EmptyState
          title="暂无测评"
          action={{ label: '创建第一个测评', onClick: () => setView({ type: 'create' }) }}
        />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">无匹配的测评</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((assessment) => {
            const statusInfo = assessment.status === 'draft'
              ? { text: '草稿', color: 'bg-yellow-100 text-yellow-700' }
              : assessment.status === 'archived'
              ? { text: '已归档', color: 'bg-slate-100 text-slate-500' }
              : assessment.isActive
              ? { text: '进行中', color: 'bg-green-100 text-green-700' }
              : { text: '已停用', color: 'bg-slate-100 text-slate-500' };

            const typeLabel = ASSESSMENT_TYPE_LABELS[(assessment as any).assessmentType] || '';

            return (
              <div
                key={assessment.id}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between">
                  {/* Clickable content area */}
                  <button
                    onClick={() => setView({ type: 'detail', assessmentId: assessment.id })}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900 truncate">{assessment.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusInfo.color}`}>
                        {statusInfo.text}
                      </span>
                      {typeLabel && (
                        <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full flex-shrink-0">
                          {typeLabel}
                        </span>
                      )}
                    </div>
                    {assessment.description && (
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">{assessment.description}</p>
                    )}
                    <div className="text-xs text-slate-400 mt-2">
                      创建于 {new Date(assessment.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                  </button>
                  {/* Action icons */}
                  <div className="flex gap-1 ml-4 shrink-0">
                    <button
                      onClick={() => updateAssessment.mutate({ assessmentId: assessment.id, isActive: !assessment.isActive }, { onSuccess: () => toast(assessment.isActive ? '已暂停' : '已启用', 'success') })}
                      className={`p-2 rounded-lg transition ${assessment.isActive ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' : 'text-amber-500 hover:text-green-600 hover:bg-green-50'}`}
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
                      onClick={() => { if (confirm('确定删除此测评？')) { deleteAssessment.mutate(assessment.id, { onSuccess: () => toast('已删除', 'success'), onError: (err) => toast(err.message || '删除失败', 'error') }); } }}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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

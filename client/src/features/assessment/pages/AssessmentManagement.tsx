import React, { useState } from 'react';
import { useAssessments, useDeleteAssessment, useUpdateAssessment, useAssessment } from '../../../api/useAssessments';
import { AssessmentWizard } from '../components/AssessmentWizard';
import { AssessmentDetail } from '../components/AssessmentDetail';
import { Eye, Trash2, Search, Plus, Edit3, PauseCircle, PlayCircle, Send, X, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PageLoading, EmptyState, StatusBadge, PageHeader, useToast } from '../../../shared/components';

type View =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'edit'; assessmentId: string }
  | { type: 'detail'; assessmentId: string };

export function AssessmentManagement() {
  const { data: assessments, isLoading } = useAssessments();
  const deleteAssessment = useDeleteAssessment();
  const updateAssessment = useUpdateAssessment();
  const { toast } = useToast();
  const [view, setView] = useState<View>({ type: 'list' });
  const [search, setSearch] = useState('');
  const [shareModalId, setShareModalId] = useState<string | null>(null);

  if (isLoading) {
    return <PageLoading text="加载测评列表中..." />;
  }

  if (view.type === 'create') {
    return (
      <AssessmentWizard
        onClose={() => setView({ type: 'list' })}
        onCreated={(id) => setView({ type: 'detail', assessmentId: id })}
      />
    );
  }

  if (view.type === 'detail') {
    return (
      <AssessmentDetail
        assessmentId={view.assessmentId}
        onClose={() => setView({ type: 'list' })}
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

  const filtered = (assessments || []).filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.title.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q);
  });

  return (
    <div>
      <PageHeader
        title="测评管理"
        description="创建和管理测评活动"
        actions={
          <button
            onClick={() => setView({ type: 'create' })}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            新建测评
          </button>
        }
      />

      {/* Search */}
      {assessments && assessments.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索测评名称或描述..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
      )}

      {!assessments || assessments.length === 0 ? (
        <EmptyState
          title="暂无测评"
          action={{ label: '创建第一个测评', onClick: () => setView({ type: 'create' }) }}
        />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">无匹配的测评</div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((assessment) => (
            <div
              key={assessment.id}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 truncate">{assessment.title}</h3>
                    {assessment.status === 'draft' ? (
                      <StatusBadge label="草稿" variant="yellow" />
                    ) : (
                      <StatusBadge
                        label={assessment.isActive ? '进行中' : '已停用'}
                        variant={assessment.isActive ? 'green' : 'slate'}
                      />
                    )}
                  </div>
                  {assessment.description && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{assessment.description}</p>
                  )}
                  <div className="flex gap-4 mt-3 text-xs text-slate-400">
                    <span>创建于 {new Date(assessment.createdAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>
                <div className="flex gap-1 ml-4 shrink-0">
                  <button
                    onClick={() => {
                      updateAssessment.mutate({
                        assessmentId: assessment.id,
                        isActive: !assessment.isActive,
                      }, {
                        onSuccess: () => toast(assessment.isActive ? '已暂停发放' : '已恢复发放', 'success'),
                      });
                    }}
                    className={`p-2 rounded-lg transition ${assessment.isActive ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' : 'text-amber-500 hover:text-green-600 hover:bg-green-50'}`}
                    title={assessment.isActive ? '暂停发放' : '恢复发放'}
                  >
                    {assessment.isActive ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setView({ type: 'edit', assessmentId: assessment.id })}
                    className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShareModalId(assessment.id)}
                    className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                    title="发放链接"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setView({ type: 'detail', assessmentId: assessment.id })}
                    className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                    title="查看详情"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('确定删除此测评？')) {
                        deleteAssessment.mutate(assessment.id, {
                          onSuccess: () => toast('测评已删除', 'success'),
                          onError: (err) => toast(err.message || '删除失败', 'error'),
                        });
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
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

        {/* Link */}
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

        {/* QR code */}
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


import React, { useState } from 'react';
import { useScales, useScale, useDeleteScale } from '../../../api/useScales';
import { ScaleDetail } from '../components/ScaleDetail';
import { AIScaleCreator } from '../components/AIScaleCreator';
import { ScaleImporter } from '../components/ScaleImporter';
import { Sparkles, FileText, Trash2, Edit3, Eye, X, ClipboardList } from 'lucide-react';
import { PageLoading, EmptyState, StatusBadge, useToast } from '../../../shared/components';
import { DistributionControl } from '../../../shared/components/DistributionControl';
import { useIsSystemLibraryScope } from '../../../shared/api/libraryScope';
import { useQueryClient } from '@tanstack/react-query';

type View =
  | { type: 'list' }
  | { type: 'ai-create' }
  | { type: 'import' }
  | { type: 'detail'; scaleId: string; editing: boolean };

type ModalView = null | { type: 'report'; scaleId: string };

const riskLabels: Record<string, string> = {
  level_1: '一级',
  level_2: '二级',
  level_3: '三级',
  level_4: '四级',
};

const riskColors: Record<string, string> = {
  level_1: 'bg-green-50 text-green-700',
  level_2: 'bg-yellow-50 text-yellow-700',
  level_3: 'bg-orange-50 text-orange-700',
  level_4: 'bg-red-50 text-red-700',
};

export function ScaleLibrary() {
  const { data: scales, isLoading } = useScales();
  const deleteScale = useDeleteScale();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isSystemScope = useIsSystemLibraryScope();
  const [view, setView] = useState<View>({ type: 'list' });
  const [modal, setModal] = useState<ModalView>(null);

  if (isLoading) {
    return <PageLoading text="加载量表库中..." />;
  }

  if (view.type === 'ai-create') {
    return (
      <AIScaleCreator
        onClose={() => setView({ type: 'list' })}
        onCreated={(scaleId) => setView({ type: 'detail', scaleId, editing: true })}
      />
    );
  }

  if (view.type === 'import') {
    return (
      <ScaleImporter
        onClose={() => setView({ type: 'list' })}
        onCreated={(scaleId) => setView({ type: 'detail', scaleId, editing: true })}
      />
    );
  }

  if (view.type === 'detail') {
    return (
      <ScaleDetail
        scaleId={view.scaleId}
        initialEditing={view.editing}
        onBack={() => setView({ type: 'list' })}
        onPreviewReport={() => setModal({ type: 'report', scaleId: view.scaleId })}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          管理心理测评量表，在个案中可发起测评
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView({ type: 'import' })}
            className="px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" />
            文本导入
          </button>
          <button
            onClick={() => setView({ type: 'ai-create' })}
            className="px-3 py-2 border border-amber-200 text-amber-700 bg-amber-50 rounded-lg text-sm font-medium hover:bg-amber-100 flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            AI 生成
          </button>
        </div>
      </div>

      {!scales || scales.length === 0 ? (
        <EmptyState
          title="暂无量表"
          action={{
            label: 'AI 创建第一个量表',
            onClick: () => setView({ type: 'ai-create' }),
          }}
        />
      ) : (
        <div className="grid gap-3">
          {scales.map((scale) => (
            <div
              key={scale.id}
              className="bg-white rounded-xl border border-slate-200 p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ClipboardList className="w-4 h-4 text-brand-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-900 truncate">{scale.title}</span>
                    {!scale.orgId && <StatusBadge label="平台" variant="blue" />}
                    <span className="text-xs px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full">
                      {scale.dimensionCount ?? '-'} 维度
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
                      {scale.itemCount ?? '-'} 题
                    </span>
                    <DistributionControl
                      resource="scales"
                      item={scale}
                      onSaved={() => qc.invalidateQueries({ queryKey: ['scales'] })}
                    />
                  </div>
                  {scale.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{scale.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => setView({ type: 'detail', scaleId: scale.id, editing: false })}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="查看"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setModal({ type: 'report', scaleId: scale.id })}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="预览报告"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (!scale.orgId && !isSystemScope) {
                        toast('无权修改：平台级内容仅系统管理员可管理', 'error');
                        return;
                      }
                      setView({ type: 'detail', scaleId: scale.id, editing: true });
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="编辑"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (!scale.orgId && !isSystemScope) {
                        toast('无权删除：平台级内容仅系统管理员可管理', 'error');
                        return;
                      }
                      if (confirm('确定删除此量表？此操作不可恢复。')) {
                        deleteScale.mutate(scale.id, {
                          onSuccess: () => toast('量表已删除', 'success'),
                          onError: (err) => toast(err.message || '删除失败', 'error'),
                        });
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report preview modal */}
      {modal && modal.type === 'report' && (
        <ReportPreviewModal
          scaleId={modal.scaleId}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function ReportPreviewModal({ scaleId, onClose }: { scaleId: string; onClose: () => void }) {
  const { data: scale, isLoading } = useScale(scaleId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-brand-600" />
            <h3 className="text-lg font-semibold text-slate-900 truncate">
              {scale?.title ? `${scale.title} — 报告预览` : '加载中...'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading || !scale ? <PageLoading /> : <ReportPreview scale={scale} />}
        </div>
      </div>
    </div>
  );
}

function ReportPreview({ scale }: { scale: NonNullable<ReturnType<typeof useScale>['data']> }) {
  const dims = scale.dimensions || [];
  const items = scale.items || [];
  const options = items[0]?.options as { label: string; value: number }[] | undefined;

  if (dims.length === 0 || !options || options.length === 0) {
    return <p className="text-sm text-slate-400">此量表缺少维度或选项信息，无法生成报告预览。</p>;
  }

  const maxOptValue = Math.max(...options.map((o) => o.value));
  const minOptValue = Math.min(...options.map((o) => o.value));

  const simDims = dims.map((dim) => {
    const dimItems = items.filter((it) => it.dimensionId === dim.id);
    const itemCount = dimItems.length || 1;
    const midValue = Math.round((maxOptValue + minOptValue) / 2);
    const simScore = dim.calculationMethod === 'average' ? midValue : midValue * itemCount;
    const matchedRule = dim.rules
      ?.sort((a, b) => Number(a.minScore) - Number(b.minScore))
      .find((r) => simScore >= Number(r.minScore) && simScore <= Number(r.maxScore));
    const maxPossible = dim.calculationMethod === 'average' ? maxOptValue : maxOptValue * itemCount;
    return { dim, itemCount, simScore, maxPossible, matchedRule };
  });

  const totalScore = simDims.reduce((s, d) => s + d.simScore, 0);
  const totalMax = simDims.reduce((s, d) => s + d.maxPossible, 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">以下为基于中间分数的模拟报告样例，实际报告将根据来访者的真实作答生成。</p>

      {/* Report header */}
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
        <h4 className="font-bold text-slate-900">{scale.title} — 测评报告</h4>
        <div className="flex gap-4 mt-2 text-xs text-slate-500">
          <span>姓名: 张三（示例）</span>
          <span>测评日期: {new Date().toLocaleDateString('zh-CN')}</span>
          <span>总分: {totalScore}/{totalMax}</span>
        </div>
      </div>

      {/* Dimension results */}
      {simDims.map(({ dim, simScore, maxPossible, matchedRule }, i) => {
        const pct = maxPossible > 0 ? Math.round((simScore / maxPossible) * 100) : 0;
        return (
          <div key={dim.id || i} className="bg-white rounded-lg p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-800">{dim.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-slate-600">{simScore}/{maxPossible}</span>
                {matchedRule?.riskLevel && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${riskColors[matchedRule.riskLevel] || 'bg-slate-100 text-slate-600'}`}>
                    {riskLabels[matchedRule.riskLevel]}
                  </span>
                )}
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
              <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            {matchedRule && (
              <div className="space-y-1">
                <p className="text-sm text-slate-700">
                  <strong>{matchedRule.label}</strong>
                  {matchedRule.description && ` — ${matchedRule.description}`}
                </p>
                {matchedRule.advice && (
                  <p className="text-xs text-brand-600 bg-brand-50 rounded px-2 py-1">建议: {matchedRule.advice}</p>
                )}
              </div>
            )}
            {!matchedRule && (
              <p className="text-xs text-slate-400">无匹配的解读规则（模拟分 {simScore}）</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

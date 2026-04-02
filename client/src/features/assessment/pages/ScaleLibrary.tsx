import React, { useState } from 'react';
import { useScales, useScale, useDeleteScale } from '../../../api/useScales';
import type { ScaleListItem } from '../../../api/useScales';
import { ScaleEditor } from '../components/ScaleEditor';
import { AIScaleCreator } from '../components/AIScaleCreator';
import { ScaleImporter } from '../components/ScaleImporter';
import { Sparkles, FileText, Trash2, Edit3, Eye, ClipboardList, X, Search } from 'lucide-react';
import { PageLoading, EmptyState, StatusBadge, PageHeader, useToast } from '../../../shared/components';

interface ScaleInitialData {
  title: string;
  description: string;
  instructions: string;
  scoringMode: 'sum' | 'average';
  options: { label: string; value: number }[];
  items: { text: string; isReverseScored: boolean; dimensionIndex: number | null }[];
  dimensions: {
    name: string;
    description: string;
    calculationMethod: 'sum' | 'average';
    rules: {
      minScore: number;
      maxScore: number;
      label: string;
      description: string;
      advice: string;
      riskLevel: string;
    }[];
  }[];
}

type View =
  | { type: 'list' }
  | { type: 'ai-create' }
  | { type: 'import' }
  | { type: 'edit'; scaleId: string }
  | { type: 'edit-new'; initialData: ScaleInitialData };

type ModalView =
  | null
  | { type: 'detail'; scaleId: string }
  | { type: 'report'; scaleId: string };

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
  const [view, setView] = useState<View>({ type: 'list' });
  const [modal, setModal] = useState<ModalView>(null);
  const [search, setSearch] = useState('');

  if (isLoading) {
    return <PageLoading text="加载量表库中..." />;
  }

  if (view.type === 'ai-create') {
    return (
      <AIScaleCreator
        onClose={() => setView({ type: 'list' })}
        onEditScale={(data) => setView({ type: 'edit-new', initialData: data })}
      />
    );
  }

  if (view.type === 'import') {
    return (
      <ScaleImporter
        onClose={() => setView({ type: 'list' })}
        onEditScale={(data) => setView({ type: 'edit-new', initialData: data })}
      />
    );
  }

  if (view.type === 'edit') {
    return (
      <ScaleEditor
        scaleId={view.scaleId}
        onClose={() => setView({ type: 'list' })}
      />
    );
  }

  if (view.type === 'edit-new') {
    return (
      <ScaleEditor
        initialData={view.initialData}
        onClose={() => setView({ type: 'list' })}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="量表库"
        description="管理心理测评量表"
        actions={
          <>
            <button
              onClick={() => setView({ type: 'import' })}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4 text-slate-500" />
              文本导入
            </button>
            <button
              onClick={() => setView({ type: 'ai-create' })}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              AI 创建量表
            </button>
          </>
        }
      />

      {/* Search bar */}
      {scales && scales.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索量表名称或描述..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
      )}

      {!scales || scales.length === 0 ? (
        <EmptyState
          title="暂无量表"
          action={{
            label: 'AI 创建第一个量表',
            onClick: () => setView({ type: 'ai-create' }),
          }}
        />
      ) : (
        <div className="grid gap-4">
          {scales.filter((s) => {
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return s.title.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q);
          }).map((scale) => (
            <div
              key={scale.id}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 truncate">{scale.title}</h3>
                    {scale.isPublic && <StatusBadge label="公开" variant="green" />}
                    {!scale.orgId && <StatusBadge label="平台" variant="blue" />}
                  </div>
                  {scale.description && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{scale.description}</p>
                  )}
                  <div className="flex gap-4 mt-3 text-xs text-slate-400">
                    <span>计分: {scale.scoringMode === 'sum' ? '求和' : '平均'}</span>
                    <span>维度: {scale.dimensionCount ?? '-'}</span>
                    <span>题目: {scale.itemCount ?? '-'}</span>
                  </div>
                </div>
                <div className="flex gap-1 ml-4 shrink-0">
                  <button
                    onClick={() => setModal({ type: 'detail', scaleId: scale.id })}
                    className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                    title="查看详情"
                  >
                    <ClipboardList className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setModal({ type: 'report', scaleId: scale.id })}
                    className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                    title="预览报告"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setView({ type: 'edit', scaleId: scale.id })}
                    className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  {scale.orgId && (
                    <button
                      onClick={() => {
                        if (confirm('确定删除此量表？此操作不可恢复。')) {
                          deleteScale.mutate(scale.id, {
                            onSuccess: () => toast('量表已删除', 'success'),
                            onError: (err) => toast(err.message || '删除失败', 'error'),
                          });
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for detail / report preview */}
      {modal && (
        <ScaleModal
          scaleId={modal.scaleId}
          mode={modal.type}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function ScaleModal({
  scaleId,
  mode,
  onClose,
}: {
  scaleId: string;
  mode: 'detail' | 'report';
  onClose: () => void;
}) {
  const { data: scale, isLoading } = useScale(scaleId);

  const title = mode === 'detail' ? '量表详情' : '报告预览';
  const Icon = mode === 'detail' ? ClipboardList : Eye;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-brand-600" />
            <h3 className="text-lg font-semibold text-slate-900 truncate">
              {scale?.title ? `${scale.title} — ${title}` : '加载中...'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading || !scale ? (
            <PageLoading />
          ) : mode === 'detail' ? (
            <ScaleDetailContent scale={scale} />
          ) : (
            <ReportPreview scale={scale} />
          )}
        </div>
      </div>
    </div>
  );
}

function ScaleDetailContent({ scale }: { scale: NonNullable<ReturnType<typeof useScale>['data']> }) {
  const dims = scale.dimensions || [];
  const items = scale.items || [];

  return (
    <div className="space-y-5">
      {/* Basic info */}
      <div className="space-y-2">
        {scale.description && <p className="text-sm text-slate-600">{scale.description}</p>}
        <div className="flex gap-6 text-sm text-slate-500">
          <span>计分: <strong className="text-slate-700">{scale.scoringMode === 'sum' ? '总分求和' : '平均分'}</strong></span>
          <span>维度: <strong className="text-slate-700">{dims.length}</strong></span>
          <span>题目: <strong className="text-slate-700">{items.length}</strong></span>
        </div>
      </div>

      {/* Instructions */}
      {scale.instructions && (
        <div>
          <span className="text-xs text-slate-400">指导语</span>
          <p className="text-sm text-slate-600 mt-0.5 bg-slate-50 rounded-lg p-3">{scale.instructions}</p>
        </div>
      )}

      {/* Dimensions & Rules */}
      {dims.length > 0 && (
        <div className="space-y-3">
          <span className="text-xs font-medium text-slate-500">维度与解读规则</span>
          {dims.map((dim, di) => (
            <div key={dim.id || di} className="bg-slate-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">{dim.name}</span>
                <span className="text-xs text-slate-400">{dim.calculationMethod === 'sum' ? '求和' : '平均'}</span>
              </div>
              {dim.description && <p className="text-xs text-slate-500">{dim.description}</p>}
              {dim.rules && dim.rules.length > 0 && (
                <div className="grid gap-1.5 mt-1">
                  {dim.rules.map((rule, ri) => (
                    <div key={rule.id || ri} className="flex items-center gap-2 text-xs bg-white rounded px-2.5 py-1.5">
                      <span className="font-mono text-slate-500 w-20 shrink-0">{rule.minScore}~{rule.maxScore} 分</span>
                      {rule.riskLevel && (
                        <span className={`px-1.5 py-0.5 rounded ${riskColors[rule.riskLevel] || 'bg-slate-100 text-slate-600'}`}>
                          {riskLabels[rule.riskLevel] || rule.riskLevel}
                        </span>
                      )}
                      <span className="text-slate-700 font-medium">{rule.label}</span>
                      {rule.description && <span className="text-slate-400 truncate">— {rule.description}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Items */}
      {items.length > 0 && (
        <div>
          <span className="text-xs font-medium text-slate-500">题目 ({items.length} 题)</span>
          <div className="mt-2 space-y-1">
            {items.map((item, ii) => {
              const dimName = dims.find((d) => d.id === item.dimensionId)?.name;
              return (
                <div key={item.id || ii} className="flex gap-2 items-start text-sm py-1">
                  <span className="text-xs text-slate-400 w-5 text-right shrink-0 mt-0.5">{ii + 1}.</span>
                  <span className="text-slate-700 flex-1">{item.text}</span>
                  <div className="flex gap-1 shrink-0">
                    {dimName && <span className="text-xs px-1.5 py-0.5 bg-brand-50 text-brand-600 rounded">{dimName}</span>}
                    {item.isReverseScored && <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded">R</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {items[0]?.options && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="text-xs text-slate-400 mr-1">选项:</span>
              {(items[0].options as { label: string; value: number }[]).map((opt, oi) => (
                <span key={oi} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                  {opt.value}={opt.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
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

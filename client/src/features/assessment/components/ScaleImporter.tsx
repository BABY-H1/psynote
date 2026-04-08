import React, { useState } from 'react';
import { useExtractScale } from '../../../api/useAI';
import { useCreateScale } from '../../../api/useScales';
import { ArrowLeft, Sparkles, Loader2, Edit3, AlertCircle } from 'lucide-react';
import { useToast } from '../../../shared/components';

interface ScaleData {
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

interface Props {
  onClose: () => void;
  onCreated: (scaleId: string) => void;
}

export function ScaleImporter({ onClose, onCreated }: Props) {
  const { toast } = useToast();
  const extractScale = useExtractScale();
  const createScale = useCreateScale();

  const [text, setText] = useState('');
  const [result, setResult] = useState<ScaleData | null>(null);

  const handleExtract = () => {
    if (!text.trim()) return;

    extractScale.mutate(
      { content: text },
      {
        onSuccess: (data) => {
          setResult({
            ...data,
            dimensions: data.dimensions.map((d) => ({ ...d, rules: [] })),
          });
        },
        onError: () => {
          toast('识别失败，请检查文本内容后重试', 'error');
        },
      },
    );
  };

  const handleSaveAndEdit = () => {
    if (!result) return;
    createScale.mutate(
      {
        title: result.title,
        description: result.description,
        instructions: result.instructions,
        scoringMode: result.scoringMode,
        dimensions: result.dimensions.map((d, i) => ({
          name: d.name,
          description: d.description,
          calculationMethod: d.calculationMethod,
          sortOrder: i,
          rules: d.rules.length > 0 ? d.rules : undefined,
        })),
        items: result.items.map((item, i) => ({
          text: item.text,
          dimensionIndex: item.dimensionIndex ?? 0,
          isReverseScored: item.isReverseScored,
          options: result.options,
          sortOrder: i,
        })),
      },
      {
        onSuccess: (created: any) => {
          toast('量表导入成功', 'success');
          onCreated(created.id);
        },
        onError: () => {
          toast('保存失败，请重试', 'error');
        },
      },
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h2 className="text-xl font-bold text-slate-900">文本导入量表</h2>
        </div>
      </div>

      {!result ? (
        /* Step 1: Input text */
        <div className="flex-1 flex flex-col">
          {/* Tips */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <div className="flex gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800 space-y-1.5">
                <p className="font-medium">为获得最佳识别效果，请确保文本包含以下信息：</p>
                <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                  <li><strong>量表名称</strong> — 如「大学生心理健康量表」</li>
                  <li><strong>指导语</strong> — 告诉作答者如何填写的说明文字</li>
                  <li><strong>题目列表</strong> — 所有题目文本（必须）</li>
                  <li><strong>选项及计分</strong> — 如「1=完全不符合 ... 5=完全符合」</li>
                  <li><strong>维度划分</strong> — 哪些题目属于哪个维度/因子</li>
                  <li><strong>计分方式</strong> — 求和或平均，是否有反向计分题</li>
                </ul>
                <p className="text-amber-600">缺少的信息 AI 会尝试推断，但建议尽量提供完整以确保准确性。识别后可进入编辑页面手动调整。</p>
              </div>
            </div>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="在此粘贴量表文本内容..."
            className="flex-1 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />

          <div className="flex justify-end mt-4">
            <button
              onClick={handleExtract}
              disabled={!text.trim() || extractScale.isPending}
              className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {extractScale.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI 识别中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  开始识别
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Step 2: Preview result */
        <div className="flex-1 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center gap-2 text-green-700">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-semibold">识别完成，请确认以下信息</span>
            </div>

            {/* Basic info */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div>
                <span className="text-xs text-slate-400">量表名称</span>
                <p className="text-sm font-semibold text-slate-900 mt-0.5">{result.title}</p>
              </div>
              {result.description && (
                <div>
                  <span className="text-xs text-slate-400">描述</span>
                  <p className="text-sm text-slate-700 mt-0.5">{result.description}</p>
                </div>
              )}
              {result.instructions && (
                <div>
                  <span className="text-xs text-slate-400">指导语</span>
                  <p className="text-sm text-slate-700 mt-0.5">{result.instructions}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-6 pt-1">
                <div className="text-sm">
                  <span className="text-slate-400">计分方式: </span>
                  <span className="font-medium text-slate-900">
                    {result.scoringMode === 'sum' ? '总分求和' : '平均分'}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-400">维度数量: </span>
                  <span className="font-medium text-slate-900">{result.dimensions.length}</span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-400">题目数量: </span>
                  <span className="font-medium text-slate-900">{result.items.length}</span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-400">选项数量: </span>
                  <span className="font-medium text-slate-900">{result.options.length}</span>
                </div>
              </div>
            </div>

            {/* Dimensions */}
            {result.dimensions.length > 0 && (
              <div>
                <span className="text-xs text-slate-400 mb-2 block">维度列表</span>
                <div className="flex flex-wrap gap-2">
                  {result.dimensions.map((dim, i) => (
                    <span
                      key={i}
                      className="text-xs px-2.5 py-1 bg-brand-50 text-brand-700 rounded-full"
                    >
                      {dim.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Options */}
            {result.options.length > 0 && (
              <div>
                <span className="text-xs text-slate-400 mb-2 block">选项</span>
                <div className="flex flex-wrap gap-2">
                  {result.options.map((opt, i) => (
                    <span
                      key={i}
                      className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full"
                    >
                      {opt.value} - {opt.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Sample items */}
            <div>
              <span className="text-xs text-slate-400 mb-2 block">
                题目预览（前 5 题）
              </span>
              <div className="space-y-1.5">
                {result.items.slice(0, 5).map((item, i) => (
                  <div key={i} className="text-sm text-slate-700 flex gap-2">
                    <span className="text-slate-400 shrink-0">{i + 1}.</span>
                    <span>{item.text}</span>
                    {item.isReverseScored && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">
                        反向
                      </span>
                    )}
                  </div>
                ))}
                {result.items.length > 5 && (
                  <p className="text-xs text-slate-400">... 共 {result.items.length} 题</p>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end mt-4 pb-4">
            <button
              onClick={() => setResult(null)}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
            >
              重新识别
            </button>
            <button
              onClick={handleSaveAndEdit}
              disabled={createScale.isPending}
              className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {createScale.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Edit3 className="w-3.5 h-3.5" />
                  确认导入并编辑
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

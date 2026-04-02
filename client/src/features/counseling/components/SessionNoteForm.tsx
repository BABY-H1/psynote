import React, { useState } from 'react';
import { useCreateSessionNote } from '../../../api/useCounseling';
import { useAnalyzeMaterial } from '../../../api/useAI';
import { Sparkles, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface Props {
  episodeId: string;
  clientId: string;
  appointmentId?: string;
  onDone: () => void;
}

export function SessionNoteForm({ episodeId, clientId, appointmentId, onDone }: Props) {
  const createNote = useCreateSessionNote();
  const analyzeMaterial = useAnalyzeMaterial();
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [duration, setDuration] = useState(50);
  const [sessionType, setSessionType] = useState('offline');
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [materialText, setMaterialText] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);

  const handleGenerateSOAP = async () => {
    if (!materialText.trim()) return;
    const result = await analyzeMaterial.mutateAsync({ content: materialText });
    setSubjective(result.subjective || '');
    setObjective(result.objective || '');
    setAssessment(result.assessment || '');
    setPlan(result.plan || '');
    if (result.summary) setSummary(result.summary);
    if (result.tags?.length) setTags(result.tags);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createNote.mutateAsync({
      careEpisodeId: episodeId,
      appointmentId,
      clientId,
      sessionDate,
      duration,
      sessionType,
      subjective: subjective || undefined,
      objective: objective || undefined,
      assessment: assessment || undefined,
      plan: plan || undefined,
      summary: summary || undefined,
      tags: tags.length > 0 ? tags : undefined,
    });
    onDone();
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="font-semibold text-slate-900 mb-4">SOAP 咨询记录</h3>

      {/* AI Generation Panel */}
      <div className="mb-4 border border-brand-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAIPanel((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-brand-50 hover:bg-brand-100 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-brand-700">
            <Sparkles className="w-4 h-4" />
            AI 智能生成
          </span>
          {showAIPanel ? (
            <ChevronUp className="w-4 h-4 text-brand-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-brand-500" />
          )}
        </button>
        {showAIPanel && (
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                粘贴咨询记录素材
              </label>
              <textarea
                value={materialText}
                onChange={(e) => setMaterialText(e.target.value)}
                rows={6}
                placeholder="粘贴咨询逐字稿、文字记录、会谈要点等原始素材..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                AI 将根据素材自动提取 S/O/A/P 内容，您可在生成后编辑调整
              </p>
              <button
                type="button"
                onClick={handleGenerateSOAP}
                disabled={analyzeMaterial.isPending || !materialText.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analyzeMaterial.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    生成 SOAP 记录
                  </>
                )}
              </button>
            </div>
            {analyzeMaterial.isError && (
              <p className="text-xs text-red-500">
                生成失败，请重试: {(analyzeMaterial.error as Error)?.message || '未知错误'}
              </p>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">日期</label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">时长(分钟)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">方式</label>
            <select
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="online">线上</option>
              <option value="offline">线下</option>
              <option value="phone">电话</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">
            S - 主观资料 (来访者自述)
          </label>
          <textarea
            value={subjective}
            onChange={(e) => setSubjective(e.target.value)}
            rows={3}
            placeholder="来访者的主诉、感受、自我报告..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">
            O - 客观资料 (咨询师观察)
          </label>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            placeholder="行为观察、情绪状态、测评数据..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">
            A - 评估分析
          </label>
          <textarea
            value={assessment}
            onChange={(e) => setAssessment(e.target.value)}
            rows={3}
            placeholder="临床判断、诊断印象、风险评估..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">
            P - 计划
          </label>
          <textarea
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            rows={3}
            placeholder="干预计划、目标设定、下次安排..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">摘要</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder="简要概括本次咨询..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {tags.length > 0 && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">标签</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-brand-50 text-brand-700 rounded-md text-xs"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                    className="text-brand-400 hover:text-brand-600"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onDone}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={createNote.isPending}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
          >
            {createNote.isPending ? '保存中...' : '保存记录'}
          </button>
        </div>
      </form>
    </div>
  );
}

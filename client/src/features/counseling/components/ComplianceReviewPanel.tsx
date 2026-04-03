import React, { useState } from 'react';
import { useComplianceReviews, useRunNoteCompliance, useRunGoldenThread, useRunQualityAssessment } from '../../../api/useCompliance';
import { useToast } from '../../../shared/components';
import { Shield, Sparkles, Loader2, AlertTriangle, CheckCircle2, Info, Target } from 'lucide-react';

const severityColors: Record<string, string> = {
  critical: 'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  info: 'bg-blue-50 border-blue-200 text-blue-700',
};

const severityIcons: Record<string, React.ReactNode> = {
  critical: <AlertTriangle className="w-3.5 h-3.5 text-red-500" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
  info: <Info className="w-3.5 h-3.5 text-blue-500" />,
};

const reviewTypeLabels: Record<string, string> = {
  note_compliance: '笔记合规',
  treatment_quality: '治疗质量',
  golden_thread: '黄金线程',
};

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-600';
  if (score >= 70) return 'text-blue-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBg(score: number): string {
  if (score >= 90) return 'bg-emerald-50 border-emerald-200';
  if (score >= 70) return 'bg-blue-50 border-blue-200';
  if (score >= 50) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

interface Props {
  episodeId: string;
  noteId?: string; // if provided, show note-level reviews
}

export function ComplianceReviewPanel({ episodeId, noteId }: Props) {
  const { data: reviews, isLoading } = useComplianceReviews({ careEpisodeId: episodeId });
  const runCompliance = useRunNoteCompliance();
  const runGoldenThread = useRunGoldenThread();
  const runQuality = useRunQualityAssessment();
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);

  const handleRunCompliance = async () => {
    if (!noteId) { toast('请先选择一条笔记', 'error'); return; }
    setRunning('compliance');
    try { await runCompliance.mutateAsync(noteId); toast('合规审查完成', 'success'); }
    catch { toast('审查失败', 'error'); }
    setRunning(null);
  };

  const handleRunGoldenThread = async () => {
    setRunning('golden');
    try { await runGoldenThread.mutateAsync(episodeId); toast('黄金线程审查完成', 'success'); }
    catch (err: any) { toast(err?.message || '审查失败', 'error'); }
    setRunning(null);
  };

  const handleRunQuality = async () => {
    if (!noteId) { toast('请先选择一条笔记', 'error'); return; }
    setRunning('quality');
    try { await runQuality.mutateAsync(noteId); toast('质量评估完成', 'success'); }
    catch { toast('评估失败', 'error'); }
    setRunning(null);
  };

  const episodeReviews = (reviews || []).filter((r: any) =>
    noteId ? r.noteId === noteId : true,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Shield className="w-4 h-4 text-brand-500" /> AI 质量审查
        </h3>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={handleRunCompliance} disabled={running !== null || !noteId}
          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5">
          {running === 'compliance' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
          笔记合规审查
        </button>
        <button onClick={handleRunGoldenThread} disabled={running !== null}
          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5">
          {running === 'golden' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Target className="w-3 h-3" />}
          黄金线程检查
        </button>
        <button onClick={handleRunQuality} disabled={running !== null || !noteId}
          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5">
          {running === 'quality' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          治疗质量评估
        </button>
      </div>

      {!noteId && (
        <p className="text-xs text-slate-400">提示：笔记合规和质量评估需要先有保存的笔记记录</p>
      )}

      {/* Reviews */}
      {episodeReviews.length > 0 && (
        <div className="space-y-3">
          {episodeReviews.map((review: any) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      {!isLoading && episodeReviews.length === 0 && (
        <div className="text-center py-6 text-xs text-slate-400">
          暂无审查记录，点击上方按钮开始审查
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: any }) {
  const [expanded, setExpanded] = useState(true);
  const score = review.score || review.goldenThreadScore || 0;
  const findings = (review.findings as any[]) || [];
  const qi = review.qualityIndicators as Record<string, number> | null;

  return (
    <div className={`rounded-lg border p-4 ${scoreBg(score)}`}>
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</div>
          <div>
            <div className="text-sm font-medium text-slate-900">
              {reviewTypeLabels[review.reviewType] || review.reviewType}
            </div>
            <div className="text-xs text-slate-400">
              {new Date(review.reviewedAt).toLocaleString('zh-CN')}
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-200/50 space-y-2">
          {/* Quality indicators (for treatment_quality type) */}
          {qi && Object.keys(qi).length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[
                { key: 'empathy', label: '共情' },
                { key: 'clinicalJudgment', label: '临床判断' },
                { key: 'interventionSpecificity', label: '干预具体性' },
                { key: 'documentationCompleteness', label: '文档完整' },
              ].map(({ key, label }) => (
                <div key={key} className="bg-white rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-slate-700">{qi[key] || 0}<span className="text-xs text-slate-400">/5</span></div>
                  <div className="text-xs text-slate-500">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Findings */}
          {findings.length > 0 && (
            <div className="space-y-1.5">
              {findings.map((f: any, i: number) => (
                <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded border text-xs ${severityColors[f.severity] || severityColors.info}`}>
                  {severityIcons[f.severity] || severityIcons.info}
                  <div className="flex-1">
                    <div>{f.description}</div>
                    {f.suggestion && <div className="text-slate-500 mt-0.5">{f.suggestion}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

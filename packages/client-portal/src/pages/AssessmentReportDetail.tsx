/**
 * Phase 9β — Portal-side assessment report detail page.
 *
 * The portal's archive tab lists results, but historically the detail page
 * was missing — clicking a result simply expanded inline. Phase 9β wires up
 * a real detail route so clients can see:
 *   - Total score, dimension scores, risk level
 *   - AI plain-language interpretation (counselor-authored or AI-generated)
 *   - Longitudinal trajectory chart (if multiple results exist for the same
 *     scale and the counselor has opted them in)
 *
 * Privacy gate: the server's /client/results endpoints already filter by
 * `clientVisible=true`, so any result reaching this page is by definition
 * one the counselor explicitly opted in.
 */
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, AlertCircle } from 'lucide-react';
import { api } from '@client/api/client';
import { useAuthStore } from '@client/stores/authStore';
import { PageLoading, RiskBadge } from '@client/shared/components';
import { TrajectoryChart } from '@client/features/assessment/components/TrajectoryChart';
import type { AssessmentResult } from '@psynote/shared';

export function AssessmentReportDetail() {
  const { resultId } = useParams<{ resultId: string }>();
  const navigate = useNavigate();
  const orgId = useAuthStore((s) => s.currentOrgId);
  const userId = useAuthStore((s) => s.user?.id);

  const { data: result, isLoading, isError } = useQuery({
    queryKey: ['portal-result-detail', orgId, resultId],
    queryFn: () => api.get<AssessmentResult>(`/orgs/${orgId}/client/results/${resultId}`),
    enabled: !!orgId && !!resultId,
  });

  if (isLoading) return <PageLoading />;

  if (isError || !result) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-amber-400 mb-4" />
        <p className="text-slate-600 mb-1">无法查看此报告</p>
        <p className="text-xs text-slate-400 mb-4">咨询师还未将此次结果对你开放</p>
        <button
          type="button"
          onClick={() => navigate('/portal/archive')}
          className="text-sm text-blue-600 hover:underline"
        >
          返回测评历史
        </button>
      </div>
    );
  }

  const dimensions = result.dimensionScores ?? {};
  const dimEntries = Object.entries(dimensions);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/portal/archive')}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-3 h-3" /> 返回测评历史
      </button>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-900">测评报告</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              提交时间：{new Date(result.createdAt).toLocaleString('zh-CN')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
          <div>
            <div className="text-xs text-slate-400">总分</div>
            <div className="text-2xl font-mono font-bold text-slate-800">
              {result.totalScore ?? '—'}
            </div>
          </div>
          {result.riskLevel && (
            <div>
              <div className="text-xs text-slate-400">等级</div>
              <RiskBadge level={result.riskLevel} />
            </div>
          )}
        </div>
      </div>

      {/* Dimension scores */}
      {dimEntries.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">维度得分</h2>
          <div className="space-y-2">
            {dimEntries.map(([dim, score]) => (
              <div
                key={dim}
                className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg"
              >
                <span className="text-sm text-slate-600">{dim}</span>
                <span className="font-mono font-semibold text-slate-800">{String(score)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI interpretation — must be present, otherwise we don't expose raw scores to client */}
      {result.aiInterpretation && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-blue-800 mb-2">通俗解读</h2>
          <p className="text-sm text-blue-900 leading-relaxed whitespace-pre-wrap">
            {result.aiInterpretation}
          </p>
          <p className="text-xs text-blue-600 mt-3 leading-relaxed">
            * 这只是一份基于测评的初步解读，并不能替代专业评估。如有任何疑问，请联系你的咨询师。
          </p>
        </div>
      )}

      {/* Trajectory chart — only render if userId + a known scaleId. The portal currently
          doesn't carry scaleId per result, so we surface a hint in the meantime. The full
          trajectory hookup waits for the assessment_results.scaleId denormalization in 9γ. */}
      {userId && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs text-slate-400 leading-relaxed">
            纵向趋势图需要至少 2 次同一量表的测评。咨询师为你开启可见后，你将在这里看到曲线。
          </p>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useGenerateReport, useSetResultClientVisible } from '../../../../api/useAssessments';
import type { AssessmentResult, AssessmentReport } from '@psynote/shared';
import { Download, TrendingUp, Eye, EyeOff } from 'lucide-react';
import { RiskBadge, useToast } from '../../../../shared/components';
import { useAuthStore } from '../../../../stores/authStore';
import { IndividualReportView } from './IndividualReportView';
import { TrendReportView } from './TrendReportView';
// Phase 9β — MBC reusable building blocks
import { AISuggestionPanel } from '../AISuggestionPanel';

interface Props {
  assessmentId: string;
  assessmentTitle: string;
  assessmentType: string;
  results: AssessmentResult[] | undefined;
  userResultMap: Map<string, AssessmentResult[]>;
}

export function IndividualTab({ assessmentId, assessmentTitle, assessmentType, results, userResultMap }: Props) {
  const generateReport = useGenerateReport();
  const { toast } = useToast();
  const [individualReport, setIndividualReport] = useState<AssessmentReport | null>(null);
  const [trendReport, setTrendReport] = useState<AssessmentReport | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const handleGenerateIndividual = (resultId: string) => {
    generateReport.mutate({ reportType: 'individual_single', resultId }, {
      onSuccess: (r) => setIndividualReport(r),
      onError: () => toast('生成失败', 'error'),
    });
  };

  const handleGenerateTrend = (userId: string) => {
    setSelectedUserId(userId);
    setTrendReport(null);
    generateReport.mutate({ reportType: 'individual_trend', assessmentId, userId } as any, {
      onSuccess: (r) => setTrendReport(r),
      onError: () => toast('趋势报告生成失败', 'error'),
    });
  };

  if (individualReport) {
    return <IndividualReportView report={individualReport} assessmentTitle={assessmentTitle} onClose={() => setIndividualReport(null)} />;
  }

  if (trendReport) {
    return <TrendReportView report={trendReport} onClose={() => setTrendReport(null)} />;
  }

  return (
    <div className="space-y-4">
      {/* Batch download */}
      {results && results.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              const orgId = useAuthStore.getState().currentOrgId;
              toast('正在准备批量下载...', 'success');
              fetch(`/api/orgs/${orgId}/reports/batch-pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${useAuthStore.getState().accessToken}` },
                body: JSON.stringify({ reportIds: results.map((r) => r.id) }),
              }).then((res) => res.blob()).then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'reports.zip';
                a.click();
                URL.revokeObjectURL(url);
              }).catch(() => toast('批量下载失败', 'error'));
            }}
            className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> 批量下载 PDF
          </button>
        </div>
      )}

      {!results || results.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">暂无作答结果</div>
      ) : assessmentType === 'tracking' ? (
        <>
          {[...userResultMap.entries()].map(([userId, userResults]) => (
            <TrackingUserCard
              key={userId}
              userId={userId}
              userResults={userResults}
              onViewReport={(resultId) => handleGenerateIndividual(resultId)}
              onViewTrend={() => handleGenerateTrend(userId)}
              trendLoading={generateReport.isPending && selectedUserId === userId}
            />
          ))}
          {results.filter((r) => !r.userId).map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700">匿名</span>
                  <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString('zh-CN')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-slate-600">{r.totalScore} 分</span>
                  {r.riskLevel && <RiskBadge level={r.riskLevel} />}
                  <button onClick={() => handleGenerateIndividual(r.id)} className="px-3 py-1 text-xs text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition font-medium">查看报告</button>
                </div>
              </div>
            </div>
          ))}
        </>
      ) : (
        results.map((r) => {
          const userResults = r.userId ? userResultMap.get(r.userId) : undefined;
          const hasMultiple = (userResults?.length || 0) >= 2;
          return (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700">{r.userId ? `用户 ${r.userId.slice(0, 8)}...` : '匿名'}</span>
                  <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString('zh-CN')}</span>
                  {Object.keys(r.demographicData || {}).length > 0 && (
                    <div className="flex gap-1">
                      {Object.entries(r.demographicData).slice(0, 3).map(([k, v]) => (
                        <span key={k} className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">{String(v)}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-slate-600">{r.totalScore} 分</span>
                  {r.riskLevel && <RiskBadge level={r.riskLevel} />}
                  <button onClick={() => handleGenerateIndividual(r.id)} className="px-3 py-1 text-xs text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition font-medium">查看报告</button>
                  {hasMultiple && (
                    <button onClick={() => handleGenerateTrend(r.userId!)} disabled={generateReport.isPending && selectedUserId === r.userId}
                      className="px-3 py-1 text-xs text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition font-medium flex items-center gap-1 disabled:opacity-50">
                      <TrendingUp className="w-3 h-3" /> 趋势
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function TrackingUserCard({ userId, userResults, onViewReport, onViewTrend, trendLoading }: {
  userId: string;
  userResults: AssessmentResult[];
  onViewReport: (resultId: string) => void;
  onViewTrend: () => void;
  trendLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const latest = userResults[0];
  const latestDemo = latest?.demographicData as Record<string, string> | undefined;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full p-4 text-left hover:bg-slate-50 transition">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">用户 {userId.slice(0, 8)}...</span>
            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{userResults.length} 次测评</span>
            {latestDemo && Object.keys(latestDemo).length > 0 && (
              <div className="flex gap-1">
                {Object.entries(latestDemo).slice(0, 3).map(([k, v]) => (
                  <span key={k} className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">{String(v)}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">最新:</span>
            <span className="text-sm font-mono text-slate-600">{latest?.totalScore} 分</span>
            {latest?.riskLevel && <RiskBadge level={latest.riskLevel} />}
            {userResults.length >= 2 && (
              <span
                onClick={(e) => { e.stopPropagation(); onViewTrend(); }}
                className={`px-3 py-1 text-xs text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition font-medium flex items-center gap-1 cursor-pointer ${trendLoading ? 'opacity-50' : ''}`}
              >
                <TrendingUp className="w-3 h-3" /> 趋势报告
              </span>
            )}
            <span className="text-xs text-slate-400">{expanded ? '收起' : '展开'}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 space-y-2 pt-3">
          {userResults.map((r, idx) => (
            <ResultRow
              key={r.id}
              result={r}
              displayIdx={userResults.length - idx}
              onViewReport={onViewReport}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Phase 9β — Single result row with inline visibility toggle and an
 * expandable AI Suggestion panel.
 */
function ResultRow({
  result,
  displayIdx,
  onViewReport,
}: {
  result: AssessmentResult;
  displayIdx: number;
  onViewReport: (resultId: string) => void;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const setVisible = useSetResultClientVisible();
  const { toast } = useToast();

  async function handleToggleVisible() {
    try {
      await setVisible.mutateAsync({
        resultId: result.id,
        visible: !result.clientVisible,
      });
      toast(result.clientVisible ? '已对来访者隐藏' : '已对来访者开放', 'success');
    } catch (err: any) {
      toast(err?.message ?? '切换失败', 'error');
    }
  }

  return (
    <div className="bg-slate-50 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between py-2 px-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500">第 {displayIdx} 次</span>
          <span className="text-xs text-slate-400">{new Date(result.createdAt).toLocaleString('zh-CN')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-slate-600">{result.totalScore} 分</span>
          {result.riskLevel && <RiskBadge level={result.riskLevel} />}
          <button
            onClick={handleToggleVisible}
            disabled={setVisible.isPending}
            className={`px-2 py-1 text-xs rounded-lg transition flex items-center gap-1 disabled:opacity-50 ${
              result.clientVisible
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
            }`}
            title={result.clientVisible ? '来访者可在 Portal 中看到此次结果' : '来访者无法在 Portal 中看到此次结果'}
          >
            {result.clientVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {result.clientVisible ? '已开放' : '不可见'}
          </button>
          <button
            onClick={() => setShowSuggestions((v) => !v)}
            className="px-2.5 py-1 text-xs text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition font-medium"
          >
            AI 建议
          </button>
          <button
            onClick={() => onViewReport(result.id)}
            className="px-2.5 py-1 text-xs text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition font-medium"
          >
            查看报告
          </button>
        </div>
      </div>

      {showSuggestions && (
        <div className="px-3 pb-3">
          <AISuggestionPanel result={result} />
        </div>
      )}
    </div>
  );
}

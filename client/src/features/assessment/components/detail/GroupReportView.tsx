import React, { useMemo } from 'react';
import type { AssessmentResult, AssessmentReport } from '@psynote/shared';
import { useReportAdvice } from '../../hooks/useReportAdvice';
import { RiskPieChart } from '../charts/RiskPieChart';
import { DimensionBarChart } from '../charts/DimensionBarChart';
import { CrossAnalysisChart } from '../charts/CrossAnalysisChart';
import { DistributionChart } from '../charts/DistributionChart';
import { ReportShell, ReportSection, AdviceEditor, ScoreCard } from '../reports/ReportShell';
import { RISK_LABELS } from '../../constants';
import { useToast } from '../../../../shared/components';
import { useAuthStore } from '../../../../stores/authStore';

function downloadPDF(reportId: string) {
  const orgId = useAuthStore.getState().currentOrgId;
  window.open(`/api/orgs/${orgId}/reports/${reportId}/pdf`, '_blank');
}

interface Props {
  report: AssessmentReport;
  results: AssessmentResult[];
  assessmentTitle: string;
  assessmentType: string;
  crossData: Record<string, Record<string, number>>;
  dimAverages: { name: string; score: number; mean: number; min: number; max: number }[];
}

export function GroupReportView({ report, results, assessmentTitle, assessmentType, crossData, dimAverages }: Props) {
  const content = report.content as {
    participantCount?: number;
    riskDistribution?: Record<string, number>;
    dimensionStats?: Record<string, { mean: number; median: number; stdDev: number; min: number; max: number }>;
  };

  const dimStats = content.dimensionStats || {};

  const customAnswerDist = useMemo(() => {
    if (assessmentType !== 'survey') return {};
    const dist: Record<string, Record<string, number>> = {};
    for (const r of results) {
      const ca = (r as any).customAnswers as Record<string, unknown> | undefined;
      if (!ca) continue;
      for (const [qId, answer] of Object.entries(ca)) {
        if (!dist[qId]) dist[qId] = {};
        if (Array.isArray(answer)) {
          for (const a of answer) {
            dist[qId][String(a)] = (dist[qId][String(a)] || 0) + 1;
          }
        } else if (typeof answer === 'string' && answer) {
          dist[qId][answer] = (dist[qId][answer] || 0) + 1;
        }
      }
    }
    return dist;
  }, [results, assessmentType]);

  return (
    <ReportShell title={`${assessmentTitle} — 团体报告`} subtitle={`${content.participantCount || results.length} 人参与`} date={new Date().toLocaleDateString('zh-CN')} onDownload={() => downloadPDF(report.id)}>
      <div className="grid grid-cols-3 gap-3">
        <ScoreCard label="参与人数" value={content.participantCount || results.length} />
        {content.riskDistribution && Object.entries(content.riskDistribution).slice(0, 2).map(([level, count]) => (
          <ScoreCard key={level} label={RISK_LABELS[level] || level} value={count} />
        ))}
      </div>

      {content.riskDistribution && (
        <ReportSection title="风险等级分布">
          <RiskPieChart distribution={content.riskDistribution} />
        </ReportSection>
      )}

      {Object.keys(dimStats).length > 0 && (
        <ReportSection title="维度统计分析">
          <DimensionBarChart dimensions={Object.entries(dimStats).map(([id, s]) => ({
            name: id.slice(0, 12), mean: s.mean, min: s.min, max: s.max,
          }))} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left pb-2 text-slate-500">维度</th>
                  <th className="text-center pb-2 text-slate-500">均值</th>
                  <th className="text-center pb-2 text-slate-500">中位数</th>
                  <th className="text-center pb-2 text-slate-500">标准差</th>
                  <th className="text-center pb-2 text-slate-500">最低</th>
                  <th className="text-center pb-2 text-slate-500">最高</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(dimStats).map(([id, s]) => (
                  <tr key={id} className="border-b border-slate-50">
                    <td className="py-1.5 text-slate-700">{id.slice(0, 16)}</td>
                    <td className="py-1.5 text-center font-mono">{s.mean}</td>
                    <td className="py-1.5 text-center font-mono">{s.median}</td>
                    <td className="py-1.5 text-center font-mono">{s.stdDev}</td>
                    <td className="py-1.5 text-center font-mono">{s.min}</td>
                    <td className="py-1.5 text-center font-mono">{s.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportSection>
      )}

      {Object.keys(crossData).length > 1 && (
        <ReportSection title="人口学交叉分析">
          <CrossAnalysisChart data={crossData} groupLabel="分组" />
        </ReportSection>
      )}

      {assessmentType === 'survey' && Object.keys(customAnswerDist).length > 0 && (
        <ReportSection title="自定义题目统计">
          {Object.entries(customAnswerDist).map(([qId, dist]) => (
            <DistributionChart key={qId} title={qId} data={Object.entries(dist).map(([label, count]) => ({ label, count }))} />
          ))}
        </ReportSection>
      )}

      <ReportSection title="综合建议">
        <GroupAdviceEditor report={report} />
      </ReportSection>
    </ReportShell>
  );
}

function GroupAdviceEditor({ report }: { report: AssessmentReport }) {
  const { advice, setAdvice, save, saving } = useReportAdvice(report.id, report.aiNarrative || undefined);
  const { toast } = useToast();

  return (
    <AdviceEditor
      value={advice}
      onChange={setAdvice}
      onSave={save}
      onAIGenerate={() => toast('团体 AI 建议功能开发中', 'success')}
      saving={saving}
    />
  );
}

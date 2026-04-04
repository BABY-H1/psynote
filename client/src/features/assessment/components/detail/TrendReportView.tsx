import React from 'react';
import type { AssessmentReport } from '@psynote/shared';
import { useReportAdvice } from '../../hooks/useReportAdvice';
import { TrendLineChart } from '../charts/TrendLineChart';
import { ReportShell, ReportSection, AdviceEditor, TrendTag } from '../reports/ReportShell';
import { useAuthStore } from '../../../../stores/authStore';

function downloadPDF(reportId: string) {
  const orgId = useAuthStore.getState().currentOrgId;
  window.open(`/api/orgs/${orgId}/reports/${reportId}/pdf`, '_blank');
}

interface Props {
  report: AssessmentReport;
  onClose: () => void;
}

export function TrendReportView({ report, onClose }: Props) {
  const content = report.content as {
    assessmentCount?: number;
    timeline?: { index: number; date: string; totalScore: string; riskLevel?: string; dimensionScores: Record<string, number> }[];
    trends?: Record<string, 'improving' | 'worsening' | 'stable'>;
  };
  const { advice, setAdvice, save, generateAI, saving, generating } = useReportAdvice(report.id, report.aiNarrative || undefined);

  const timeline = content.timeline || [];
  const trends = content.trends || {};

  const chartData = timeline.map((t) => ({
    label: `第${t.index}次`,
    totalScore: Number(t.totalScore),
    ...t.dimensionScores,
  }));

  const dimKeys = timeline.length > 0 ? Object.keys(timeline[0].dimensionScores) : [];
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const handleAIGenerate = () => {
    const latest = timeline[timeline.length - 1];
    generateAI({
      scaleName: '追踪评估',
      dimensions: latest ? Object.entries(latest.dimensionScores).map(([name, score]) => ({ name, score, label: trends[name] === 'improving' ? '改善' : trends[name] === 'worsening' ? '恶化' : '稳定' })) : [],
      totalScore: latest ? Number(latest.totalScore) : 0,
      riskLevel: latest?.riskLevel,
    });
  };

  return (
    <ReportShell title="追踪评估趋势报告" subtitle={`共 ${content.assessmentCount || 0} 次测评`} onDownload={() => downloadPDF(report.id)}>
      <div className="flex justify-end">
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">返回列表</button>
      </div>

      <ReportSection title="总分变化趋势">
        <TrendLineChart data={chartData} lines={[{ key: 'totalScore', name: '总分', color: '#6366f1' }]} />
      </ReportSection>

      {dimKeys.length > 0 && (
        <ReportSection title="维度分数变化">
          <TrendLineChart data={chartData} lines={dimKeys.map((k, i) => ({ key: k, name: k.slice(0, 8), color: colors[i % colors.length] }))} />
        </ReportSection>
      )}

      {Object.keys(trends).length > 0 && (
        <ReportSection title="变化趋势">
          <div className="flex flex-wrap gap-3">
            {Object.entries(trends).map(([dim, trend]) => (
              <div key={dim} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-700">{dim.slice(0, 12)}</span>
                <TrendTag trend={trend} />
              </div>
            ))}
          </div>
        </ReportSection>
      )}

      <ReportSection title="综合建议">
        <AdviceEditor value={advice} onChange={setAdvice} onSave={save} onAIGenerate={handleAIGenerate} saving={saving} generating={generating} />
      </ReportSection>
    </ReportShell>
  );
}

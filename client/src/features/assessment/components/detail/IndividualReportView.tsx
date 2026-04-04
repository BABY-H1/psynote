import React from 'react';
import type { AssessmentReport } from '@psynote/shared';
import { useReportAdvice } from '../../hooks/useReportAdvice';
import { DimensionRadar } from '../charts/DimensionRadar';
import { ReportShell, ReportSection, AdviceEditor, ScoreCard, DimensionRow } from '../reports/ReportShell';
import { RISK_LABELS } from '../../constants';
import { useAuthStore } from '../../../../stores/authStore';

function downloadPDF(reportId: string) {
  const orgId = useAuthStore.getState().currentOrgId;
  window.open(`/api/orgs/${orgId}/reports/${reportId}/pdf`, '_blank');
}

interface Props {
  report: AssessmentReport;
  assessmentTitle: string;
  onClose: () => void;
}

export function IndividualReportView({ report, assessmentTitle, onClose }: Props) {
  const content = report.content as {
    totalScore?: string | number;
    riskLevel?: string;
    demographics?: Record<string, unknown>;
    interpretationPerDimension?: { dimension: string; score: number; label: string; riskLevel?: string; advice?: string }[];
  };
  const interps = content.interpretationPerDimension || [];
  const { advice, setAdvice, save, generateAI, saving, generating } = useReportAdvice(report.id, report.aiNarrative || undefined);

  const handleAIGenerate = () => {
    generateAI({
      scaleName: assessmentTitle,
      dimensions: interps.map((d) => ({ name: d.dimension, score: d.score, label: d.label, riskLevel: d.riskLevel, advice: d.advice })),
      totalScore: Number(content.totalScore) || 0,
      riskLevel: content.riskLevel,
    });
  };

  const demographics = content.demographics as Record<string, unknown> | undefined;

  return (
    <ReportShell title={`${assessmentTitle} — 个人报告`} date={new Date().toLocaleDateString('zh-CN')} onDownload={() => downloadPDF(report.id)}>
      <div className="flex justify-end">
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">返回列表</button>
      </div>

      {demographics && Object.keys(demographics).length > 0 && (
        <ReportSection title="基本信息">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(demographics).map(([key, val]) => (
              <div key={key} className="bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-xs text-slate-400">{key}</span>
                <p className="text-sm font-medium text-slate-700">{String(val)}</p>
              </div>
            ))}
          </div>
        </ReportSection>
      )}

      <ReportSection title="评估结果">
        <div className="grid grid-cols-2 gap-3">
          <ScoreCard label="总分" value={content.totalScore || '-'} />
          {content.riskLevel && <ScoreCard label="风险等级" value={RISK_LABELS[content.riskLevel] || content.riskLevel} color={content.riskLevel === 'level_3' || content.riskLevel === 'level_4' ? 'text-red-600' : undefined} />}
        </div>
      </ReportSection>

      {interps.length > 0 && (
        <ReportSection title="维度评估">
          <div className="space-y-2">
            {interps.map((d, i) => (
              <DimensionRow key={i} name={d.dimension} score={d.score} label={d.label} riskLevel={d.riskLevel} advice={d.advice} />
            ))}
          </div>
          {interps.length >= 2 && (
            <div className="mt-4">
              <DimensionRadar dimensions={interps.map((d) => ({ name: d.dimension, score: d.score }))} />
            </div>
          )}
        </ReportSection>
      )}

      <ReportSection title="综合建议">
        <AdviceEditor
          value={advice}
          onChange={setAdvice}
          onSave={save}
          onAIGenerate={handleAIGenerate}
          saving={saving}
          generating={generating}
        />
      </ReportSection>
    </ReportShell>
  );
}

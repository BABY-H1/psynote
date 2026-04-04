import React, { useState } from 'react';
import { useAssessment, useResults, useUpdateAssessment, useGenerateReport, useDistributions } from '../../../api/useAssessments';
import type { AssessmentReport } from '@psynote/shared';
import {
  ArrowLeft, BarChart3, Users, FileText, ToggleLeft, ToggleRight, Loader2,
} from 'lucide-react';
import { PageLoading, useToast } from '../../../shared/components';
import { ASSESSMENT_TYPE_LABELS } from '../constants';

import { useDimAverages, useCrossData, useUserResultMap, useRiskDistribution } from './detail/useAssessmentData';
import { OverviewTab } from './detail/OverviewTab';
import { IndividualTab } from './detail/IndividualTab';
import { GroupReportView } from './detail/GroupReportView';

interface Props {
  assessmentId: string;
  onClose: () => void;
}

export function AssessmentDetail({ assessmentId, onClose }: Props) {
  const { data: assessment, isLoading } = useAssessment(assessmentId);
  const { data: results } = useResults({ assessmentId });
  const { data: dists } = useDistributions(assessmentId);
  const updateAssessment = useUpdateAssessment();
  const generateReport = useGenerateReport();
  const { toast } = useToast();

  const [tab, setTab] = useState<'overview' | 'individual' | 'group'>('overview');
  const [groupReport, setGroupReport] = useState<AssessmentReport | null>(null);

  const dimAverages = useDimAverages(results);
  const crossData = useCrossData(results);
  const userResultMap = useUserResultMap(results);
  const riskDist = useRiskDistribution(results);

  if (isLoading || !assessment) return <PageLoading text="加载测评详情..." />;

  const assessmentType = assessment.assessmentType || 'screening';

  const toggleActive = () => {
    updateAssessment.mutate({ assessmentId: assessment.id, isActive: !assessment.isActive }, {
      onSuccess: () => toast(assessment.isActive ? '已停用' : '已启用', 'success'),
    });
  };

  const handleGenerateGroupReport = () => {
    if (!results || results.length === 0) return;
    generateReport.mutate({
      reportType: 'group_single',
      resultIds: results.map((r) => r.id),
      title: `${assessment.title} — 团体报告`,
    }, {
      onSuccess: (r) => { setGroupReport(r); toast('团体报告已生成', 'success'); },
      onError: () => toast('生成失败', 'error'),
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 truncate">{assessment.title}</h2>
            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{ASSESSMENT_TYPE_LABELS[assessmentType]}</span>
          </div>
          {assessment.description && <p className="text-sm text-slate-500 mt-0.5">{assessment.description}</p>}
        </div>
        <button onClick={toggleActive} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${assessment.isActive ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {assessment.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {assessment.isActive ? '进行中' : '已停用'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {[
          { key: 'overview' as const, label: '概览', icon: BarChart3 },
          { key: 'individual' as const, label: `个人报告 (${results?.length || 0})`, icon: Users },
          { key: 'group' as const, label: '团体报告', icon: FileText },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${tab === key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <OverviewTab
          assessment={assessment}
          results={results}
          distributions={dists}
          riskDist={riskDist}
          dimAverages={dimAverages}
          crossData={crossData}
        />
      )}

      {tab === 'individual' && (
        <IndividualTab
          assessmentId={assessmentId}
          assessmentTitle={assessment.title}
          assessmentType={assessmentType}
          results={results}
          userResultMap={userResultMap}
        />
      )}

      {tab === 'group' && (
        <div className="space-y-4">
          {!results || results.length < 2 ? (
            <div className="text-center py-12 text-sm text-slate-400">需要至少 2 条结果才能查看团体报告</div>
          ) : groupReport ? (
            <GroupReportView
              report={groupReport}
              results={results}
              assessmentTitle={assessment.title}
              assessmentType={assessmentType}
              crossData={crossData}
              dimAverages={dimAverages}
            />
          ) : (
            <div className="text-center py-8 space-y-3">
              {generateReport.isPending ? (
                <div className="flex items-center gap-2 justify-center text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> 正在生成团体报告...
                </div>
              ) : (
                <button
                  onClick={handleGenerateGroupReport}
                  className="px-6 py-3 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition flex items-center gap-2 mx-auto"
                >
                  <FileText className="w-4 h-4" /> 查看团体报告
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useAssessment, useResults, useUpdateAssessment, useDeleteAssessment, useGenerateReport, useDistributions } from '../../../api/useAssessments';
import type { Assessment, AssessmentReport, ServiceStatus } from '@psynote/shared';
import {
  BarChart3, Users, FileText, Loader2,
  Edit3, Trash2, Send, PauseCircle, PlayCircle, X, Copy, Check,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  PageLoading,
  useToast,
  ServiceDetailLayout,
  ServiceTabBar,
  type ServiceTab,
} from '../../../shared/components';
import { ASSESSMENT_TYPE_LABELS } from '../constants';

import { useDimAverages, useCrossData, useUserResultMap, useRiskDistribution } from './detail/useAssessmentData';
import { OverviewTab } from './detail/OverviewTab';
import { IndividualTab } from './detail/IndividualTab';
import { GroupReportView } from './detail/GroupReportView';

/**
 * Phase 4c — AssessmentDetail migrated to Phase 2 shared components.
 *
 *  - Header (back / title / status pill / actions) → `<ServiceDetailLayout variant="tabs">`
 *  - Tab bar → `<ServiceTabBar visibleTabs=['overview','records','timeline']>`
 *      overview  → 概览     → OverviewTab
 *      records   → 个人报告 → IndividualTab (the per-user answer records)
 *      timeline  → 团体报告 → GroupReportView (cross-user aggregate view)
 *    The "参与者" and "资产" tabs are hidden — assessments don't have those concepts.
 *  - Internal tab state uses the standard `ServiceTab` type so that future
 *    deep-links / cross-module nav can target tabs by canonical name.
 *  - Status pill: collapses `(status, isActive)` into the closest ServiceStatus
 *    and overrides the visual to preserve the original assessment palette
 *    (yellow draft / green active / slate paused).
 */

interface Props {
  assessmentId: string;
  onClose: () => void;
  onEdit?: (assessmentId: string) => void;
}

const VISIBLE_TABS: ServiceTab[] = ['overview', 'records', 'timeline'];

const TAB_ICONS: Partial<Record<ServiceTab, React.ReactNode>> = {
  overview: <BarChart3 className="w-4 h-4" />,
  records: <Users className="w-4 h-4" />,
  timeline: <FileText className="w-4 h-4" />,
};

type LogicalAssessmentStatus = 'draft' | 'active' | 'paused' | 'archived';

function getLogicalStatus(a: Assessment): LogicalAssessmentStatus {
  if (a.status === 'draft') return 'draft';
  if (a.status === 'archived') return 'archived';
  return a.isActive ? 'active' : 'paused';
}

function mapToServiceStatus(ls: LogicalAssessmentStatus): ServiceStatus {
  switch (ls) {
    case 'draft':
      return 'draft';
    case 'archived':
      return 'archived';
    case 'active':
      return 'ongoing';
    case 'paused':
      return 'paused';
  }
}

const STATUS_OVERRIDE: Record<LogicalAssessmentStatus, { text: string; cls: string }> = {
  draft: { text: '草稿', cls: 'bg-yellow-100 text-yellow-700' },
  active: { text: '进行中', cls: 'bg-green-100 text-green-700' },
  paused: { text: '已停用', cls: 'bg-slate-100 text-slate-500' },
  archived: { text: '已归档', cls: 'bg-slate-100 text-slate-500' },
};

export function AssessmentDetail({ assessmentId, onClose, onEdit }: Props) {
  const { data: assessment, isLoading } = useAssessment(assessmentId);
  const { data: results } = useResults({ assessmentId });
  const { data: dists } = useDistributions(assessmentId);
  const updateAssessment = useUpdateAssessment();
  const deleteAssessment = useDeleteAssessment();
  const generateReport = useGenerateReport();
  const { toast } = useToast();

  const [tab, setTab] = useState<ServiceTab>('overview');
  const [groupReport, setGroupReport] = useState<AssessmentReport | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const dimAverages = useDimAverages(results, (assessment as any)?.dimensionNameMap);
  const crossData = useCrossData(results);
  const userResultMap = useUserResultMap(results);
  const riskDist = useRiskDistribution(results);

  if (isLoading || !assessment) return <PageLoading text="加载测评详情..." />;

  const assessmentType = assessment.assessmentType || 'screening';
  const ls = getLogicalStatus(assessment);
  const statusOverride = STATUS_OVERRIDE[ls];

  const toggleActive = () => {
    updateAssessment.mutate({ assessmentId: assessment.id, isActive: !assessment.isActive }, {
      onSuccess: () => toast(assessment.isActive ? '已停用' : '已启用', 'success'),
    });
  };

  const handleDelete = () => {
    if (confirm(`确定删除"${assessment.title}"？`)) {
      deleteAssessment.mutate(assessment.id, {
        onSuccess: () => { toast('测评已删除', 'success'); onClose(); },
        onError: (err) => toast(err.message || '删除失败', 'error'),
      });
    }
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

  // Tab labels (records gets a count badge for parity with the previous version)
  const tabLabels: Partial<Record<ServiceTab, string>> = {
    overview: '概览',
    records: `个人报告 (${results?.length || 0})`,
    timeline: '团体报告',
  };

  return (
    <ServiceDetailLayout
      title={assessment.title}
      status={mapToServiceStatus(ls)}
      statusText={statusOverride.text}
      statusClassName={statusOverride.cls}
      metaLine={
        <>
          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
            {ASSESSMENT_TYPE_LABELS[assessmentType]}
          </span>
          {assessment.description && <span>{assessment.description}</span>}
        </>
      }
      onBack={onClose}
      actions={
        <>
          <button
            onClick={toggleActive}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition ${
              assessment.isActive
                ? 'border border-amber-200 text-amber-700 hover:bg-amber-50'
                : 'border border-green-200 text-green-700 hover:bg-green-50'
            }`}
          >
            {assessment.isActive ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
            {assessment.isActive ? '暂停' : '启用'}
          </button>
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
          >
            <Send className="w-4 h-4" /> 发放
          </button>
          {onEdit && (
            <button
              onClick={() => onEdit(assessment.id)}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
            >
              <Edit3 className="w-4 h-4" /> 编辑
            </button>
          )}
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" /> 删除
          </button>
        </>
      }
      tabBar={
        <ServiceTabBar
          value={tab}
          onChange={setTab}
          visibleTabs={VISIBLE_TABS}
          labels={tabLabels}
          icons={TAB_ICONS}
        />
      }
    >
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

      {tab === 'records' && (
        <IndividualTab
          assessmentId={assessmentId}
          assessmentTitle={assessment.title}
          assessmentType={assessmentType}
          results={results}
          userResultMap={userResultMap}
        />
      )}

      {tab === 'timeline' && (
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

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal assessmentId={assessmentId} onClose={() => setShowShareModal(false)} />
      )}
    </ServiceDetailLayout>
  );
}

function ShareModal({ assessmentId, onClose }: { assessmentId: string; onClose: () => void }) {
  const shareUrl = `${window.location.origin}/assess/${assessmentId}`;
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast('链接已复制', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">发放测评</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div>
          <span className="text-sm font-medium text-slate-700 block mb-2">公开链接</span>
          <div className="flex gap-2">
            <input value={shareUrl} readOnly className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 select-all" />
            <button onClick={copyLink} className="px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition flex items-center gap-1.5">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        </div>
        <div>
          <span className="text-sm font-medium text-slate-700 block mb-2">二维码</span>
          <div className="flex justify-center bg-white p-4 border border-slate-100 rounded-lg">
            <QRCodeSVG value={shareUrl} size={180} level="M" />
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">可截图或打印用于线下场景</p>
        </div>
      </div>
    </div>
  );
}

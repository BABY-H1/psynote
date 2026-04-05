import React, { useState } from 'react';
import { useAssessment, useResults, useUpdateAssessment, useDeleteAssessment, useGenerateReport, useDistributions } from '../../../api/useAssessments';
import type { AssessmentReport } from '@psynote/shared';
import {
  ArrowLeft, BarChart3, Users, FileText, Loader2,
  Edit3, Trash2, Send, PauseCircle, PlayCircle, X, Copy, Check,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PageLoading, useToast } from '../../../shared/components';
import { ASSESSMENT_TYPE_LABELS } from '../constants';

import { useDimAverages, useCrossData, useUserResultMap, useRiskDistribution } from './detail/useAssessmentData';
import { OverviewTab } from './detail/OverviewTab';
import { IndividualTab } from './detail/IndividualTab';
import { GroupReportView } from './detail/GroupReportView';

interface Props {
  assessmentId: string;
  onClose: () => void;
  onEdit?: (assessmentId: string) => void;
}

export function AssessmentDetail({ assessmentId, onClose, onEdit }: Props) {
  const { data: assessment, isLoading } = useAssessment(assessmentId);
  const { data: results } = useResults({ assessmentId });
  const { data: dists } = useDistributions(assessmentId);
  const updateAssessment = useUpdateAssessment();
  const deleteAssessment = useDeleteAssessment();
  const generateReport = useGenerateReport();
  const { toast } = useToast();

  const [tab, setTab] = useState<'overview' | 'individual' | 'group'>('overview');
  const [groupReport, setGroupReport] = useState<AssessmentReport | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const dimAverages = useDimAverages(results, (assessment as any).dimensionNameMap);
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

  const tabs = [
    { key: 'overview' as const, label: '概览', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'individual' as const, label: `个人报告 (${results?.length || 0})`, icon: <Users className="w-4 h-4" /> },
    { key: 'group' as const, label: '团体报告', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">{assessment.title}</h2>
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                {ASSESSMENT_TYPE_LABELS[assessmentType]}
              </span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                assessment.status === 'draft'
                  ? 'bg-yellow-100 text-yellow-700'
                  : assessment.isActive
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {assessment.status === 'draft' ? '草稿' : assessment.isActive ? '进行中' : '已停用'}
              </span>
            </div>
            {assessment.description && (
              <p className="text-sm text-slate-500 mt-0.5">{assessment.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
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
        </div>
      </div>

      {/* Tabs — pill style matching GroupInstanceDetail */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon}
            {t.label}
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

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal assessmentId={assessmentId} onClose={() => setShowShareModal(false)} />
      )}
    </div>
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

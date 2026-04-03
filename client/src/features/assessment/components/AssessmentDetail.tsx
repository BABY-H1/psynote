import React, { useState, useMemo } from 'react';
import { useAssessment, useResults, useUpdateAssessment, useGenerateReport, useDistributions, useCreateDistribution } from '../../../api/useAssessments';
import { useReportAdvice } from '../hooks/useReportAdvice';
import type { AssessmentResult, AssessmentBlock, AssessmentReport, Distribution } from '@psynote/shared';
import {
  ArrowLeft, BarChart3, Users, FileText, Send, Plus,
  ToggleLeft, ToggleRight, Loader2, Download, TrendingUp,
} from 'lucide-react';
import { PageLoading, RiskBadge, useToast } from '../../../shared/components';
import { RiskPieChart } from './charts/RiskPieChart';
import { DimensionRadar } from './charts/DimensionRadar';
import { DimensionBarChart } from './charts/DimensionBarChart';
import { TrendLineChart } from './charts/TrendLineChart';
import { CrossAnalysisChart } from './charts/CrossAnalysisChart';
import { DistributionChart } from './charts/DistributionChart';
import { ReportShell, ReportSection, AdviceEditor, ScoreCard, DimensionRow, RiskTag, TrendTag } from './reports/ReportShell';

interface Props {
  assessmentId: string;
  onClose: () => void;
}

import { RISK_LABELS, RISK_COLORS, ASSESSMENT_TYPE_LABELS, COLLECT_MODE_LABELS } from '../constants';

export function AssessmentDetail({ assessmentId, onClose }: Props) {
  const { data: assessment, isLoading } = useAssessment(assessmentId);
  const { data: results } = useResults({ assessmentId });
  const { data: dists } = useDistributions(assessmentId);
  const updateAssessment = useUpdateAssessment();
  const createDistribution = useCreateDistribution();
  const generateReport = useGenerateReport();
  const { toast } = useToast();

  const [tab, setTab] = useState<'overview' | 'individual' | 'group'>('overview');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [individualReport, setIndividualReport] = useState<AssessmentReport | null>(null);
  const [groupReport, setGroupReport] = useState<AssessmentReport | null>(null);
  const [trendReport, setTrendReport] = useState<AssessmentReport | null>(null);

  // All useMemo hooks must be before any early return
  const dimAverages = useMemo(() => {
    if (!results || results.length === 0) return [];
    const dimTotals: Record<string, { sum: number; count: number }> = {};
    for (const r of results) {
      for (const [dimId, score] of Object.entries(r.dimensionScores)) {
        if (!dimTotals[dimId]) dimTotals[dimId] = { sum: 0, count: 0 };
        dimTotals[dimId].sum += score;
        dimTotals[dimId].count += 1;
      }
    }
    return Object.entries(dimTotals).map(([id, { sum, count }]) => ({
      name: id.slice(0, 12),
      score: Math.round((sum / count) * 100) / 100,
      mean: Math.round((sum / count) * 100) / 100,
      min: 0,
      max: 0,
    }));
  }, [results]);

  // Cross analysis by demographic
  const crossData = useMemo(() => {
    if (!results || results.length === 0) return {};
    const byGroup: Record<string, Record<string, number>> = {};
    for (const r of results) {
      const demo = r.demographicData as Record<string, string>;
      const group = demo?.grade || demo?.gender || demo?.department || 'other';
      if (!byGroup[group]) byGroup[group] = {};
      const level = r.riskLevel || 'none';
      byGroup[group][level] = (byGroup[group][level] || 0) + 1;
    }
    return byGroup;
  }, [results]);

  // Users with multiple results (for tracking)
  const userResultMap = useMemo(() => {
    if (!results) return new Map<string, AssessmentResult[]>();
    const map = new Map<string, AssessmentResult[]>();
    for (const r of results) {
      if (!r.userId) continue;
      if (!map.has(r.userId)) map.set(r.userId, []);
      map.get(r.userId)!.push(r);
    }
    return map;
  }, [results]);

  // Early return AFTER all hooks
  if (isLoading || !assessment) return <PageLoading text="加载测评详情..." />;

  const blocks = (assessment.blocks || []) as AssessmentBlock[];
  const assessmentType = assessment.assessmentType || 'screening';

  const riskDist = (results || []).reduce<Record<string, number>>((acc, r) => {
    acc[r.riskLevel || 'none'] = (acc[r.riskLevel || 'none'] || 0) + 1;
    return acc;
  }, {});
  const hasRiskData = Object.keys(riskDist).some((k) => k !== 'none');
  const hasDimData = dimAverages.length > 0;
  const hasDemoData = Object.keys(crossData).length > 1;

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

  const handleGenerateIndividual = (resultId: string) => {
    generateReport.mutate({ reportType: 'individual_single', resultId }, {
      onSuccess: (r) => { setIndividualReport(r); },
      onError: () => toast('生成失败', 'error'),
    });
  };

  const handleGenerateTrend = (userId: string) => {
    setSelectedUserId(userId);
    setTrendReport(null);
    generateReport.mutate({
      reportType: 'individual_trend',
      assessmentId: assessment.id,
      userId,
    } as any, {
      onSuccess: (r) => setTrendReport(r),
      onError: () => toast('趋势报告生成失败', 'error'),
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

      {/* === OVERVIEW TAB === */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Config + Stats row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <h3 className="text-sm font-medium text-slate-900">测评配置</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-400">类型</span><p className="text-slate-700 font-medium">{ASSESSMENT_TYPE_LABELS[assessmentType]}</p></div>
                <div><span className="text-slate-400">收集方式</span><p className="text-slate-700 font-medium">{COLLECT_MODE_LABELS[assessment.collectMode] || assessment.collectMode}</p></div>
                <div><span className="text-slate-400">区块</span><p className="text-slate-700 font-medium">{blocks.length} 个</p></div>
                <div><span className="text-slate-400">量表</span><p className="text-slate-700 font-medium">{blocks.filter((b) => b.type === 'scale').length} 个</p></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-medium text-slate-900 mb-3">作答统计</h3>
              <div className={`grid gap-3 ${hasRiskData && assessmentType === 'screening' ? 'grid-cols-5' : hasRiskData ? 'grid-cols-3' : 'grid-cols-1'}`}>
                <ScoreCard label="已提交" value={results?.length || 0} />
                {hasRiskData && assessmentType === 'screening' && (
                  ['level_1', 'level_2', 'level_3', 'level_4'].map((level) => (
                    <ScoreCard key={level} label={RISK_LABELS[level]} value={riskDist[level] || 0} />
                  ))
                )}
                {hasRiskData && assessmentType !== 'screening' && (
                  Object.entries(riskDist).filter(([k]) => k !== 'none').map(([level, count]) => (
                    <ScoreCard key={level} label={RISK_LABELS[level] || level} value={count} />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Charts — only render when relevant data exists */}
          {(hasRiskData || hasDimData) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hasRiskData && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-medium text-slate-900 mb-3">
                    {assessmentType === 'screening' ? '四级风险分布' : '风险等级分布'}
                  </h3>
                  <RiskPieChart distribution={
                    assessmentType === 'screening'
                      ? { level_1: riskDist.level_1 || 0, level_2: riskDist.level_2 || 0, level_3: riskDist.level_3 || 0, level_4: riskDist.level_4 || 0 }
                      : riskDist
                  } />
                </div>
              )}
              {hasDimData && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-medium text-slate-900 mb-3">维度均分</h3>
                  <DimensionRadar dimensions={dimAverages} />
                </div>
              )}
            </div>
          )}

          {/* Cross analysis — only when demographics have 2+ groups */}
          {hasDemoData && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-medium text-slate-900 mb-3">人口学交叉分析</h3>
              <CrossAnalysisChart data={crossData} groupLabel="分组" />
            </div>
          )}

          {/* Distribution records */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-900">发放记录 ({dists?.length || 0})</h3>
              <button
                onClick={() => {
                  const count = (dists?.length || 0) + 1;
                  createDistribution.mutate({ assessmentId: assessment.id, batchLabel: `第 ${count} 次发放`, mode: 'public' }, {
                    onSuccess: () => toast(`第 ${count} 次发放已创建`, 'success'),
                  });
                }}
                disabled={createDistribution.isPending}
                className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 transition disabled:opacity-50 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> 新增发放
              </button>
            </div>
            {!dists || dists.length === 0 ? (
              <p className="text-sm text-slate-400">暂无发放记录</p>
            ) : (
              <div className="space-y-2">
                {dists.map((d: Distribution, i: number) => (
                  <div key={d.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-700">{d.batchLabel || `第 ${dists.length - i} 次`}</span>
                      <span className="text-xs text-slate-400">{new Date(d.createdAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">完成: {d.completedCount}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${d.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {d.status === 'active' ? '进行中' : d.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* === INDIVIDUAL REPORT TAB === */}
      {tab === 'individual' && (
        <div className="space-y-4">
          {individualReport ? (
            <IndividualReportView report={individualReport} assessmentTitle={assessment.title} onClose={() => setIndividualReport(null)} />
          ) : trendReport ? (
            <TrendReportView report={trendReport} onClose={() => setTrendReport(null)} />
          ) : !results || results.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400">暂无作答结果</div>
          ) : assessmentType === 'tracking' ? (
            /* Tracking: group by user, expandable to see each round */
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
              {/* Anonymous results without userId */}
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
            /* Other types: one row per result */
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
      )}

      {/* === GROUP REPORT TAB === */}
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

// ─── Individual Report View ─────────────────────────────────────

function IndividualReportView({ report, assessmentTitle, onClose }: { report: AssessmentReport; assessmentTitle: string; onClose: () => void }) {
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
    <ReportShell title={`${assessmentTitle} — 个人报告`} date={new Date().toLocaleDateString('zh-CN')}>
      <div className="flex justify-end">
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">返回列表</button>
      </div>

      {/* Basic info */}
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

// ─── Trend Report View ──────────────────────────────────────────

function TrendReportView({ report, onClose }: { report: AssessmentReport; onClose: () => void }) {
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
    <ReportShell title="追踪评估趋势报告" subtitle={`共 ${content.assessmentCount || 0} 次测评`}>
      <div className="flex justify-end">
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">返回列表</button>
      </div>

      <ReportSection title="总分变化趋势">
        <TrendLineChart
          data={chartData}
          lines={[{ key: 'totalScore', name: '总分', color: '#6366f1' }]}
        />
      </ReportSection>

      {dimKeys.length > 0 && (
        <ReportSection title="维度分数变化">
          <TrendLineChart
            data={chartData}
            lines={dimKeys.map((k, i) => ({ key: k, name: k.slice(0, 8), color: colors[i % colors.length] }))}
          />
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

// ─── Group Report View ──────────────────────────────────────────

function GroupReportView({ report, results, assessmentTitle, assessmentType, crossData, dimAverages }: {
  report: AssessmentReport;
  results: AssessmentResult[];
  assessmentTitle: string;
  assessmentType: string;
  crossData: Record<string, Record<string, number>>;
  dimAverages: { name: string; score: number; mean: number; min: number; max: number }[];
}) {
  const content = report.content as {
    participantCount?: number;
    riskDistribution?: Record<string, number>;
    dimensionStats?: Record<string, { mean: number; median: number; stdDev: number; min: number; max: number }>;
  };

  const dimStats = content.dimensionStats || {};

  // Survey: aggregate custom answers
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
    <ReportShell title={`${assessmentTitle} — 团体报告`} subtitle={`${content.participantCount || results.length} 人参与`} date={new Date().toLocaleDateString('zh-CN')}>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <ScoreCard label="参与人数" value={content.participantCount || results.length} />
        {content.riskDistribution && Object.entries(content.riskDistribution).slice(0, 2).map(([level, count]) => (
          <ScoreCard key={level} label={RISK_LABELS[level] || level} value={count} />
        ))}
      </div>

      {/* Risk distribution */}
      {content.riskDistribution && (
        <ReportSection title="风险等级分布">
          <RiskPieChart distribution={content.riskDistribution} />
        </ReportSection>
      )}

      {/* Dimension stats */}
      {Object.keys(dimStats).length > 0 && (
        <ReportSection title="维度统计分析">
          <DimensionBarChart dimensions={Object.entries(dimStats).map(([id, s]) => ({
            name: id.slice(0, 12),
            mean: s.mean,
            min: s.min,
            max: s.max,
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

      {/* Cross analysis */}
      {Object.keys(crossData).length > 1 && (
        <ReportSection title="人口学交叉分析">
          <CrossAnalysisChart data={crossData} groupLabel="分组" />
        </ReportSection>
      )}

      {/* Survey: custom answer distributions */}
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
      {/* User header — click to expand */}
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

      {/* Expanded: show each round */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 space-y-2 pt-3">
          {userResults.map((r, idx) => (
            <div key={r.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-500">第 {userResults.length - idx} 次</span>
                <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-slate-600">{r.totalScore} 分</span>
                {r.riskLevel && <RiskBadge level={r.riskLevel} />}
                <button
                  onClick={() => onViewReport(r.id)}
                  className="px-2.5 py-1 text-xs text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition font-medium"
                >
                  查看报告
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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

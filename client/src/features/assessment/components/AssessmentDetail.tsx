import React, { useState, useMemo } from 'react';
import { useAssessment, useResults, useUpdateAssessment, useGenerateReport, useDistributions, useCreateDistribution } from '../../../api/useAssessments';
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
import { ReportShell, ReportSection, AINarrative, ScoreCard, DimensionRow, RiskTag, TrendTag } from './reports/ReportShell';

interface Props {
  assessmentId: string;
  onClose: () => void;
}

const riskLabels: Record<string, string> = { level_1: '一级', level_2: '二级', level_3: '三级', level_4: '四级' };
const collectModeLabels: Record<string, string> = { anonymous: '完全匿名', optional_register: '可选注册', require_register: '必须登录' };
const typeLabels: Record<string, string> = { screening: '心理筛查', intake: '入组筛选', tracking: '追踪评估', survey: '调查问卷' };

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
  const assessmentType = (assessment as any).assessmentType || 'screening';

  const riskDist = (results || []).reduce<Record<string, number>>((acc, r) => {
    acc[r.riskLevel || 'none'] = (acc[r.riskLevel || 'none'] || 0) + 1;
    return acc;
  }, {});

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
            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{typeLabels[assessmentType]}</span>
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
                <div><span className="text-slate-400">类型</span><p className="text-slate-700 font-medium">{typeLabels[assessmentType]}</p></div>
                <div><span className="text-slate-400">收集方式</span><p className="text-slate-700 font-medium">{collectModeLabels[assessment.collectMode] || assessment.collectMode}</p></div>
                <div><span className="text-slate-400">区块</span><p className="text-slate-700 font-medium">{blocks.length} 个</p></div>
                <div><span className="text-slate-400">量表</span><p className="text-slate-700 font-medium">{blocks.filter((b) => b.type === 'scale').length} 个</p></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-medium text-slate-900 mb-3">作答统计</h3>
              <div className="grid grid-cols-3 gap-3">
                <ScoreCard label="已提交" value={results?.length || 0} />
                {Object.entries(riskDist).slice(0, 2).map(([level, count]) => (
                  <ScoreCard key={level} label={riskLabels[level] || '无风险'} value={count} />
                ))}
              </div>
            </div>
          </div>

          {/* Charts */}
          {results && results.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-medium text-slate-900 mb-3">风险等级分布</h3>
                <RiskPieChart distribution={riskDist} />
              </div>
              {dimAverages.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-medium text-slate-900 mb-3">维度均分</h3>
                  <DimensionRadar dimensions={dimAverages} />
                </div>
              )}
            </div>
          )}

          {/* Cross analysis */}
          {Object.keys(crossData).length > 1 && (
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
          {!results || results.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400">暂无作答结果</div>
          ) : (
            results.map((r) => {
              const userResults = r.userId ? userResultMap.get(r.userId) : undefined;
              const hasMultiple = (userResults?.length || 0) >= 2;
              return (
                <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                  {/* Result header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{r.userId ? `用户 ${r.userId.slice(0, 8)}...` : '匿名'}</span>
                      <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString('zh-CN')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-slate-600">{r.totalScore} 分</span>
                      {r.riskLevel && <RiskBadge level={r.riskLevel} />}
                      <button
                        onClick={() => handleGenerateIndividual(r.id)}
                        disabled={generateReport.isPending}
                        className="px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 rounded transition disabled:opacity-50"
                      >
                        {generateReport.isPending ? '生成中...' : '生成报告'}
                      </button>
                      {hasMultiple && (
                        <button
                          onClick={() => handleGenerateTrend(r.userId!)}
                          disabled={generateReport.isPending && selectedUserId === r.userId}
                          className="px-2 py-1 text-xs text-amber-600 hover:bg-amber-50 rounded transition disabled:opacity-50 flex items-center gap-1"
                        >
                          <TrendingUp className="w-3 h-3" /> 趋势
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dimension scores preview */}
                  {Object.entries(r.dimensionScores).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(r.dimensionScores).map(([dimId, score]) => (
                        <span key={dimId} className="text-xs px-2 py-1 bg-slate-50 text-slate-600 rounded">{dimId.slice(0, 8)}: {score}</span>
                      ))}
                    </div>
                  )}

                  {/* Demographics */}
                  {Object.keys(r.demographicData || {}).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(r.demographicData).map(([k, v]) => (
                        <span key={k} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded">{k}: {String(v)}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Individual report modal-like display */}
          {individualReport && (
            <IndividualReportView report={individualReport} assessmentTitle={assessment.title} onClose={() => setIndividualReport(null)} />
          )}

          {/* Trend report */}
          {trendReport && selectedUserId && (
            <TrendReportView report={trendReport} onClose={() => setTrendReport(null)} />
          )}
        </div>
      )}

      {/* === GROUP REPORT TAB === */}
      {tab === 'group' && (
        <div className="space-y-4">
          {!results || results.length < 2 ? (
            <div className="text-center py-12 text-sm text-slate-400">需要至少 2 条结果才能生成团体报告</div>
          ) : (
            <>
              {!groupReport && (
                <div className="text-center py-8">
                  <button
                    onClick={handleGenerateGroupReport}
                    disabled={generateReport.isPending}
                    className="px-6 py-3 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition disabled:opacity-50 flex items-center gap-2 mx-auto"
                  >
                    {generateReport.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    生成团体报告
                  </button>
                </div>
              )}

              {groupReport && (
                <GroupReportView
                  report={groupReport}
                  results={results}
                  assessmentTitle={assessment.title}
                  assessmentType={assessmentType}
                  crossData={crossData}
                  dimAverages={dimAverages}
                />
              )}
            </>
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

  return (
    <ReportShell title={`${assessmentTitle} — 个人报告`} date={new Date().toLocaleDateString('zh-CN')}>
      <div className="flex justify-end">
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">关闭报告</button>
      </div>

      {/* Score summary */}
      <ReportSection title="评估结果">
        <div className="grid grid-cols-2 gap-3">
          <ScoreCard label="总分" value={content.totalScore || '-'} />
          {content.riskLevel && <ScoreCard label="风险等级" value={riskLabels[content.riskLevel] || content.riskLevel} color={content.riskLevel === 'level_3' || content.riskLevel === 'level_4' ? 'text-red-600' : undefined} />}
        </div>
      </ReportSection>

      {/* Dimension interpretations */}
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

      {/* AI narrative */}
      {report.aiNarrative && (
        <ReportSection title="专业分析">
          <AINarrative content={report.aiNarrative} />
        </ReportSection>
      )}
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

  const timeline = content.timeline || [];
  const trends = content.trends || {};

  const chartData = timeline.map((t) => ({
    label: `第${t.index}次`,
    totalScore: Number(t.totalScore),
    ...t.dimensionScores,
  }));

  const dimKeys = timeline.length > 0 ? Object.keys(timeline[0].dimensionScores) : [];
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <ReportShell title="追踪评估趋势报告" subtitle={`共 ${content.assessmentCount || 0} 次测评`}>
      <div className="flex justify-end">
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">关闭</button>
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
          <ScoreCard key={level} label={riskLabels[level] || level} value={count} />
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

      {/* AI narrative */}
      {report.aiNarrative && (
        <ReportSection title="AI 综合分析">
          <AINarrative content={report.aiNarrative} />
        </ReportSection>
      )}
    </ReportShell>
  );
}

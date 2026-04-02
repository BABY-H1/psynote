import React, { useState } from 'react';
import { useAssessment, useResults, useUpdateAssessment, useGenerateReport, useDistributions, useCreateDistribution } from '../../../api/useAssessments';
import type { AssessmentResult, AssessmentBlock, AssessmentReport, Distribution } from '@psynote/shared';
import {
  ArrowLeft, Users, BarChart3, Download, FileText, Send, TrendingUp, Plus,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';
import { PageLoading, RiskBadge, useToast } from '../../../shared/components';

interface Props {
  assessmentId: string;
  onClose: () => void;
}

const riskLabels: Record<string, string> = {
  level_1: '一级', level_2: '二级', level_3: '三级', level_4: '四级',
};
const riskColors: Record<string, string> = {
  level_1: 'bg-green-50 text-green-700', level_2: 'bg-yellow-50 text-yellow-700',
  level_3: 'bg-orange-50 text-orange-700', level_4: 'bg-red-50 text-red-700',
};
const collectModeLabels: Record<string, string> = {
  anonymous: '完全匿名', optional_register: '可选注册', require_register: '必须登录',
};

export function AssessmentDetail({ assessmentId, onClose }: Props) {
  const { data: assessment, isLoading } = useAssessment(assessmentId);
  const { data: results } = useResults({ assessmentId });
  const { data: dists } = useDistributions(assessmentId);
  const updateAssessment = useUpdateAssessment();
  const createDistribution = useCreateDistribution();
  const generateReport = useGenerateReport();
  const { toast } = useToast();
  const [tab, setTab] = useState<'overview' | 'results' | 'distributions' | 'trend'>('overview');
  const [groupReport, setGroupReport] = useState<AssessmentReport | null>(null);
  const [trendReport, setTrendReport] = useState<AssessmentReport | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  if (isLoading || !assessment) return <PageLoading text="加载测评详情..." />;

  const blocks = (assessment.blocks || []) as AssessmentBlock[];
  const resultDisplay = assessment.resultDisplay as { mode: string; show: string[] } | undefined;

  const toggleActive = () => {
    updateAssessment.mutate({ assessmentId: assessment.id, isActive: !assessment.isActive }, {
      onSuccess: () => toast(assessment.isActive ? '测评已停用' : '测评已启用', 'success'),
    });
  };

  const riskDist = (results || []).reduce<Record<string, number>>((acc, r) => {
    const level = r.riskLevel || 'none';
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, {});

  const handleGenerateGroupReport = () => {
    if (!results || results.length === 0) return;
    generateReport.mutate({
      reportType: 'group_single',
      resultIds: results.map((r) => r.id),
      title: `${assessment.title} — 团体报告`,
    }, {
      onSuccess: (report) => {
        setGroupReport(report);
        toast('团体报告已生成', 'success');
      },
      onError: () => toast('报告生成失败', 'error'),
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-slate-900 truncate">{assessment.title}</h2>
          {assessment.description && <p className="text-sm text-slate-500 mt-0.5">{assessment.description}</p>}
        </div>
        <button onClick={toggleActive} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${assessment.isActive ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
          {assessment.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {assessment.isActive ? '进行中' : '已停用'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {[
          { key: 'overview' as const, label: '概览', icon: BarChart3 },
          { key: 'results' as const, label: `作答结果 (${results?.length || 0})`, icon: Users },
          { key: 'distributions' as const, label: `发放记录 (${dists?.length || 0})`, icon: Send },
          ...((assessment as any).assessmentType === 'tracking' ? [{ key: 'trend' as const, label: '纵向对比', icon: TrendingUp }] : []),
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${tab === key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Config summary */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-medium text-slate-900">测评配置</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-400">收集方式</span><p className="text-slate-700 font-medium">{collectModeLabels[assessment.collectMode] || assessment.collectMode}</p></div>
              <div><span className="text-slate-400">结果展示</span><p className="text-slate-700 font-medium">{resultDisplay?.mode === 'none' ? '不展示' : `自定义 (${resultDisplay?.show?.length || 0} 项)`}</p></div>
              <div><span className="text-slate-400">内容区块</span><p className="text-slate-700 font-medium">{blocks.length} 个</p></div>
              <div><span className="text-slate-400">量表</span><p className="text-slate-700 font-medium">{blocks.filter((b) => b.type === 'scale').length} 个</p></div>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-900">作答统计</h3>
              {results && results.length >= 2 && (
                <button
                  onClick={handleGenerateGroupReport}
                  disabled={generateReport.isPending}
                  className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {generateReport.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  生成团体报告
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900">{results?.length || 0}</div>
                <div className="text-xs text-slate-400">已提交</div>
              </div>
              {Object.entries(riskDist).map(([level, count]) => (
                <div key={level} className="text-center">
                  <div className="text-2xl font-bold text-slate-900">{count}</div>
                  <div className="text-xs text-slate-400">{riskLabels[level] || '无风险'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Group report display */}
          {groupReport && (
            <GroupReportView report={groupReport} />
          )}
        </div>
      )}

      {tab === 'results' && (
        <div className="space-y-3">
          {!results || results.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400">暂无作答结果</div>
          ) : (
            results.map((r) => (
              <ResultCard key={r.id} result={r} assessmentTitle={assessment.title} />
            ))
          )}
        </div>
      )}

      {tab === 'distributions' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                const count = (dists?.length || 0) + 1;
                createDistribution.mutate({
                  assessmentId: assessment.id,
                  batchLabel: `第 ${count} 次发放`,
                  mode: 'public',
                }, {
                  onSuccess: () => toast(`第 ${count} 次发放已创建`, 'success'),
                  onError: () => toast('创建失败', 'error'),
                });
              }}
              disabled={createDistribution.isPending}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> 发起第 {(dists?.length || 0) + 1} 次测评
            </button>
          </div>
          {!dists || dists.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400">暂无发放记录</div>
          ) : (
            dists.map((d: Distribution, i: number) => (
              <div key={d.id} className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-slate-900">{d.batchLabel || `第 ${dists.length - i} 次`}</span>
                    <span className="text-xs text-slate-400 ml-3">{new Date(d.createdAt).toLocaleString('zh-CN')}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">已完成: {d.completedCount}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${d.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {d.status === 'active' ? '进行中' : d.status === 'completed' ? '已结束' : d.status}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'trend' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">选择一位用户查看其多次测评结果的变化趋势。</p>
          {/* User selector from results */}
          {(() => {
            const userIds = [...new Set((results || []).filter((r) => r.userId).map((r) => r.userId!))];
            const userResultCounts = userIds.map((uid) => ({
              userId: uid,
              count: (results || []).filter((r) => r.userId === uid).length,
            })).filter((u) => u.count >= 2);

            if (userResultCounts.length === 0) {
              return <div className="text-center py-12 text-sm text-slate-400">需要同一用户至少 2 次作答结果才能生成纵向对比</div>;
            }

            return (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {userResultCounts.map((u) => (
                    <button
                      key={u.userId}
                      onClick={() => {
                        setSelectedUserId(u.userId);
                        setTrendReport(null);
                        generateReport.mutate({
                          reportType: 'individual_trend',
                          assessmentId: assessment.id,
                          userId: u.userId,
                        } as any, {
                          onSuccess: (report) => setTrendReport(report),
                          onError: () => toast('趋势报告生成失败', 'error'),
                        });
                      }}
                      disabled={generateReport.isPending && selectedUserId === u.userId}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                        selectedUserId === u.userId ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {u.userId.slice(0, 8)}... ({u.count} 次)
                    </button>
                  ))}
                </div>

                {generateReport.isPending && (
                  <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> 生成中...</div>
                )}

                {trendReport && <TrendReportView report={trendReport} />}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function TrendReportView({ report }: { report: AssessmentReport }) {
  const content = report.content as {
    assessmentCount?: number;
    timeline?: { index: number; date: string; totalScore: string; riskLevel?: string; dimensionScores: Record<string, number> }[];
    trends?: Record<string, 'improving' | 'worsening' | 'stable'>;
  };

  const timeline = content.timeline || [];
  const trends = content.trends || {};
  const trendLabels: Record<string, { label: string; color: string }> = {
    improving: { label: '改善', color: 'text-green-600' },
    worsening: { label: '恶化', color: 'text-red-600' },
    stable: { label: '稳定', color: 'text-slate-500' },
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-brand-600" />
        <h3 className="text-sm font-medium text-slate-900">纵向对比 ({content.assessmentCount} 次测评)</h3>
      </div>

      {/* Score timeline */}
      <div>
        <span className="text-xs font-medium text-slate-500">总分变化</span>
        <div className="flex gap-3 mt-2 overflow-x-auto">
          {timeline.map((t, i) => (
            <div key={i} className="text-center shrink-0">
              <div className="text-lg font-bold text-slate-900">{t.totalScore}</div>
              <div className="text-xs text-slate-400">第 {t.index} 次</div>
              <div className="text-xs text-slate-400">{new Date(t.date).toLocaleDateString('zh-CN')}</div>
              {t.riskLevel && <RiskBadge level={t.riskLevel} />}
            </div>
          ))}
        </div>
      </div>

      {/* Dimension comparison table */}
      {timeline.length > 0 && Object.keys(timeline[0].dimensionScores).length > 0 && (
        <div>
          <span className="text-xs font-medium text-slate-500">维度得分对比</span>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs text-slate-400 pb-2 pr-4">维度</th>
                  {timeline.map((t) => (
                    <th key={t.index} className="text-center text-xs text-slate-400 pb-2 px-2">第 {t.index} 次</th>
                  ))}
                  <th className="text-center text-xs text-slate-400 pb-2 px-2">趋势</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(timeline[0].dimensionScores).map((dim) => (
                  <tr key={dim} className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-700 text-xs">{dim}</td>
                    {timeline.map((t) => (
                      <td key={t.index} className="py-2 px-2 text-center font-mono text-xs text-slate-600">{t.dimensionScores[dim] ?? '-'}</td>
                    ))}
                    <td className={`py-2 px-2 text-center text-xs font-medium ${trendLabels[trends[dim]]?.color || 'text-slate-400'}`}>
                      {trendLabels[trends[dim]]?.label || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ result, assessmentTitle }: { result: AssessmentResult; assessmentTitle: string }) {
  const [expanded, setExpanded] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const generateReport = useGenerateReport();
  const { toast } = useToast();

  const handleGenerateIndividual = () => {
    generateReport.mutate({ reportType: 'individual_single', resultId: result.id }, {
      onSuccess: (report) => {
        setReportData(report);
        setExpanded(true);
      },
      onError: () => toast('报告生成失败', 'error'),
    });
  };

  const downloadReport = () => {
    const content = reportData?.content || {};
    const interps = (content.interpretationPerDimension || []) as { dimension: string; score: number; label: string; riskLevel?: string; advice?: string }[];

    const lines = [
      `${assessmentTitle} — 个人测评报告`,
      `=${'='.repeat(40)}`,
      '',
      `提交时间: ${new Date(result.createdAt).toLocaleString('zh-CN')}`,
      `总分: ${result.totalScore}`,
      result.riskLevel ? `风险等级: ${riskLabels[result.riskLevel] || result.riskLevel}` : '',
      '',
    ];

    if (interps.length > 0) {
      lines.push('维度评估:');
      interps.forEach((d) => {
        lines.push(`  ${d.dimension}: ${d.score} 分 — ${d.label}`);
        if (d.riskLevel) lines.push(`    风险等级: ${riskLabels[d.riskLevel] || d.riskLevel}`);
        if (d.advice) lines.push(`    建议: ${d.advice}`);
      });
    }

    const demo = Object.entries(result.demographicData || {});
    if (demo.length > 0) {
      lines.push('', '人口学信息:');
      demo.forEach(([k, v]) => lines.push(`  ${k}: ${v}`));
    }

    const blob = new Blob([lines.filter(Boolean).join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `报告_${result.userId?.slice(0, 8) || '匿名'}_${new Date(result.createdAt).toLocaleDateString('zh-CN').replace(/\//g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast('报告已下载', 'success');
  };

  const interps = (reportData?.content?.interpretationPerDimension || []) as { dimension: string; score: number; label: string; riskLevel?: string; advice?: string }[];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setExpanded(!expanded)} className="flex-1 text-left flex items-center gap-2">
          <span className="text-sm text-slate-700">{result.userId ? `用户 ${result.userId.slice(0, 8)}...` : '匿名'}</span>
          <span className="text-xs text-slate-400">{new Date(result.createdAt).toLocaleString('zh-CN')}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-mono text-slate-600">总分: {result.totalScore}</span>
          {result.riskLevel && <RiskBadge level={result.riskLevel} />}
          {!reportData ? (
            <button
              onClick={handleGenerateIndividual}
              disabled={generateReport.isPending}
              className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition disabled:opacity-50"
              title="生成个人报告"
            >
              {generateReport.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            </button>
          ) : (
            <button onClick={downloadReport} className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg transition" title="下载报告">
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
          {/* Full report with interpretations */}
          {interps.length > 0 ? (
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-500">维度评估</span>
              {interps.map((d, i) => (
                <div key={i} className="bg-slate-50 rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800">{d.dimension}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-slate-600">{d.score} 分</span>
                      {d.riskLevel && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${riskColors[d.riskLevel] || 'bg-slate-100 text-slate-600'}`}>
                          {riskLabels[d.riskLevel] || d.riskLevel}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-slate-700">{d.label}</p>
                  {d.advice && <p className="text-xs text-brand-600 bg-brand-50 rounded px-2 py-1">建议: {d.advice}</p>}
                </div>
              ))}
            </div>
          ) : (
            /* Raw dimension scores if no report yet */
            Object.entries(result.dimensionScores).length > 0 && (
              <div>
                <span className="text-xs text-slate-400">维度得分（点击报告按钮生成完整解读）</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.entries(result.dimensionScores).map(([dimId, score]) => (
                    <span key={dimId} className="text-xs px-2 py-1 bg-slate-50 text-slate-600 rounded">{dimId.slice(0, 8)}: {score}</span>
                  ))}
                </div>
              </div>
            )
          )}

          {/* Demographics */}
          {Object.keys(result.demographicData || {}).length > 0 && (
            <div>
              <span className="text-xs text-slate-400">人口学信息</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(result.demographicData).map(([key, val]) => (
                  <span key={key} className="text-xs px-2 py-1 bg-slate-50 text-slate-600 rounded">{key}: {String(val)}</span>
                ))}
              </div>
            </div>
          )}

          {result.aiInterpretation && (
            <div>
              <span className="text-xs text-slate-400">AI 解读</span>
              <p className="text-sm text-slate-600 mt-1 bg-blue-50 rounded-lg p-3">{result.aiInterpretation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupReportView({ report }: { report: AssessmentReport }) {
  const content = report.content as {
    participantCount?: number;
    riskDistribution?: Record<string, number>;
    dimensionStats?: Record<string, { mean: number; median: number; stdDev: number; min: number; max: number }>;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-brand-600" />
        <h3 className="text-sm font-medium text-slate-900">{report.title}</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-slate-400">参与人数</span><p className="text-slate-700 font-bold text-lg">{content.participantCount || 0}</p></div>
      </div>

      {/* Risk distribution */}
      {content.riskDistribution && Object.keys(content.riskDistribution).length > 0 && (
        <div>
          <span className="text-xs font-medium text-slate-500">风险分布</span>
          <div className="flex gap-3 mt-2">
            {Object.entries(content.riskDistribution).map(([level, count]) => (
              <div key={level} className="text-center">
                <div className="text-lg font-bold text-slate-900">{count}</div>
                <div className={`text-xs px-2 py-0.5 rounded-full ${riskColors[level] || 'bg-slate-100 text-slate-600'}`}>
                  {riskLabels[level] || level}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dimension stats */}
      {content.dimensionStats && Object.keys(content.dimensionStats).length > 0 && (
        <div>
          <span className="text-xs font-medium text-slate-500">维度统计</span>
          <div className="mt-2 space-y-2">
            {Object.entries(content.dimensionStats).map(([dimId, stats]) => (
              <div key={dimId} className="bg-slate-50 rounded-lg p-3">
                <span className="text-xs text-slate-500">{dimId.slice(0, 12)}...</span>
                <div className="grid grid-cols-5 gap-2 mt-1 text-xs">
                  <div><span className="text-slate-400">均值</span><p className="font-medium text-slate-700">{stats.mean}</p></div>
                  <div><span className="text-slate-400">中位数</span><p className="font-medium text-slate-700">{stats.median}</p></div>
                  <div><span className="text-slate-400">标准差</span><p className="font-medium text-slate-700">{stats.stdDev}</p></div>
                  <div><span className="text-slate-400">最低</span><p className="font-medium text-slate-700">{stats.min}</p></div>
                  <div><span className="text-slate-400">最高</span><p className="font-medium text-slate-700">{stats.max}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

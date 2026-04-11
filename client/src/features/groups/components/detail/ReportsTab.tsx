import React, { useState } from 'react';
import { BarChart3, ClipboardCheck, TrendingUp, Loader2, AlertCircle, Users } from 'lucide-react';
import { api } from '../../../../api/client';
import { useAuthStore } from '../../../../stores/authStore';
import { useToast } from '../../../../shared/components';
import type { GroupInstance, GroupEnrollment } from '@psynote/shared';

interface Props {
  instance: GroupInstance & { enrollments: (GroupEnrollment & { user: { name: string; email: string } })[] };
}

interface LongitudinalReport {
  id: string;
  content: {
    instanceTitle: string;
    memberCount: number;
    memberNames: Record<string, string>;
    assessmentComparisons: Array<{
      assessmentId: string;
      participantCount: number;
      prePostPairs: number;
      preMean: number;
      postMean: number;
      meanChange: number;
      cohensD: number | null;
      memberDetails: Array<{ userId: string; preScore: number | null; postScore: number | null; change: number | null }>;
    }>;
  };
}

export function ReportsTab({ instance }: Props) {
  const config = (instance as any).assessmentConfig || {};
  const preGroupIds = (config.preGroup || []) as string[];
  const postGroupIds = (config.postGroup || []) as string[];
  const hasAssessments = preGroupIds.length > 0 || postGroupIds.length > 0;

  const [report, setReport] = useState<LongitudinalReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const generateReport = async () => {
    setGenerating(true);
    setError(null);
    try {
      const orgId = useAuthStore.getState().currentOrgId;
      const result = await api.post<LongitudinalReport>(
        `/orgs/${orgId}/assessment-reports`,
        {
          reportType: 'group_longitudinal',
          instanceId: instance.id,
          instanceType: 'group',
        },
      );
      setReport(result);
      toast('报告生成成功', 'success');
    } catch (err: any) {
      setError(err?.message || '报告生成失败');
      toast(err?.message || '报告生成失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const effectSizeLabel = (d: number | null): { text: string; color: string } => {
    if (d == null) return { text: '数据不足', color: 'text-slate-400' };
    const abs = Math.abs(d);
    if (abs < 0.2) return { text: '无显著效果', color: 'text-slate-500' };
    if (abs < 0.5) return { text: '小效果', color: 'text-blue-600' };
    if (abs < 0.8) return { text: '中等效果', color: 'text-green-600' };
    return { text: '大效果', color: 'text-violet-600' };
  };

  return (
    <div className="space-y-6">
      {/* Assessment Config Status */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardCheck className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-900">评估量表配置</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-lg p-3 ${preGroupIds.length > 0 ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'}`}>
            <p className="text-xs text-slate-500">入组前测</p>
            <p className={`text-sm font-medium ${preGroupIds.length > 0 ? 'text-green-700' : 'text-slate-400'}`}>
              {preGroupIds.length > 0 ? `${preGroupIds.length} 个量表` : '未配置'}
            </p>
          </div>
          <div className={`rounded-lg p-3 ${postGroupIds.length > 0 ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'}`}>
            <p className="text-xs text-slate-500">结组后测</p>
            <p className={`text-sm font-medium ${postGroupIds.length > 0 ? 'text-green-700' : 'text-slate-400'}`}>
              {postGroupIds.length > 0 ? `${postGroupIds.length} 个量表` : '未配置'}
            </p>
          </div>
        </div>
      </div>

      {/* Report Generation */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-slate-900">效果报告</h3>
        </div>

        {!hasAssessments ? (
          <div className="text-center py-8">
            <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 mb-1">请先配置评估量表</p>
            <p className="text-xs text-slate-400">在创建活动时配置入组前测和结组后测，用于生成纵向对比报告</p>
          </div>
        ) : instance.status !== 'ended' && instance.status !== 'archived' ? (
          <div className="text-center py-8">
            <TrendingUp className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 mb-1">活动进行中</p>
            <p className="text-xs text-slate-400">活动结束后可在此生成完整的纵向对比报告</p>
          </div>
        ) : !report ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-600 mb-3">活动已结束，可以生成团体效果报告</p>
            <button
              onClick={generateReport}
              disabled={generating}
              className="px-5 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 disabled:opacity-50 flex items-center gap-2 mx-auto"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
              {generating ? '生成中...' : '生成纵向对比报告'}
            </button>
            <p className="text-xs text-slate-400 mt-2">对比前后测数据，计算效果量(Cohen's d)，显示个体变化</p>
            {error && (
              <div className="mt-3 flex items-center gap-2 text-xs text-red-500 justify-center">
                <AlertCircle className="w-3.5 h-3.5" /> {error}
              </div>
            )}
          </div>
        ) : (
          /* Report Results Display */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600">参与人数：{report.content.memberCount}</span>
              </div>
              <button onClick={generateReport} disabled={generating}
                className="text-xs text-violet-600 hover:text-violet-700">
                {generating ? '重新生成中...' : '重新生成'}
              </button>
            </div>

            {report.content.assessmentComparisons.map((comp, idx) => {
              const effect = effectSizeLabel(comp.cohensD);
              return (
                <div key={idx} className="border border-slate-200 rounded-lg overflow-hidden">
                  {/* Summary bar */}
                  <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">
                      量表 {idx + 1}（{comp.prePostPairs} 组前后测配对）
                    </span>
                    <span className={`text-xs font-medium ${effect.color}`}>
                      {comp.cohensD != null ? `d = ${comp.cohensD}` : ''} {effect.text}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="px-4 py-3 grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-slate-400">前测均分</p>
                      <p className="text-lg font-bold text-slate-700">{comp.preMean}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">后测均分</p>
                      <p className="text-lg font-bold text-slate-700">{comp.postMean}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">变化</p>
                      <p className={`text-lg font-bold ${comp.meanChange < 0 ? 'text-green-600' : comp.meanChange > 0 ? 'text-red-500' : 'text-slate-500'}`}>
                        {comp.meanChange > 0 ? '+' : ''}{comp.meanChange}
                      </p>
                    </div>
                  </div>

                  {/* Individual details */}
                  <div className="px-4 pb-3">
                    <p className="text-xs text-slate-400 mb-2">个体详情</p>
                    <div className="space-y-1">
                      {comp.memberDetails.map((m) => {
                        const name = report.content.memberNames[m.userId] || m.userId.slice(0, 8);
                        return (
                          <div key={m.userId} className="flex items-center justify-between text-xs py-1">
                            <span className="text-slate-700">{name}</span>
                            <div className="flex gap-4">
                              <span className="text-slate-400">前: {m.preScore ?? '-'}</span>
                              <span className="text-slate-400">后: {m.postScore ?? '-'}</span>
                              <span className={m.change != null && m.change < 0 ? 'text-green-600' : m.change != null && m.change > 0 ? 'text-red-500' : 'text-slate-400'}>
                                {m.change != null ? (m.change > 0 ? `+${m.change}` : m.change) : '-'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

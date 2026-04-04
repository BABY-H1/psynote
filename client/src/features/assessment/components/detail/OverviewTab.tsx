import React, { useState, useMemo } from 'react';
import { useCreateEpisode } from '../../../../api/useCounseling';
import { useCreateDistribution } from '../../../../api/useAssessments';
import type { AssessmentBlock, AssessmentResult, Distribution } from '@psynote/shared';
import {
  BarChart3, Plus, Loader2, FolderPlus, AlertTriangle,
} from 'lucide-react';
import { useToast } from '../../../../shared/components';
import { RiskPieChart } from '../charts/RiskPieChart';
import { DimensionRadar } from '../charts/DimensionRadar';
import { CrossAnalysisChart } from '../charts/CrossAnalysisChart';
import { ScoreCard } from '../reports/ReportShell';
import { RISK_LABELS, ASSESSMENT_TYPE_LABELS, COLLECT_MODE_LABELS } from '../../constants';

interface Props {
  assessment: any;
  results: AssessmentResult[] | undefined;
  distributions: Distribution[] | undefined;
  riskDist: Record<string, number>;
  dimAverages: { name: string; score: number; mean: number; min: number; max: number }[];
  crossData: Record<string, Record<string, number>>;
}

export function OverviewTab({ assessment, results, distributions, riskDist, dimAverages, crossData }: Props) {
  const createDistribution = useCreateDistribution();
  const createEpisode = useCreateEpisode();
  const { toast } = useToast();

  const [showBatchCreate, setShowBatchCreate] = useState(false);
  const [batchRiskFilter, setBatchRiskFilter] = useState<string[]>(['level_3', 'level_4']);
  const [batchCreating, setBatchCreating] = useState(false);
  const [batchCreatedCount, setBatchCreatedCount] = useState(0);

  const blocks = (assessment.blocks || []) as AssessmentBlock[];
  const assessmentType = assessment.assessmentType || 'screening';
  const hasRiskData = Object.keys(riskDist).some((k) => k !== 'none');
  const hasDimData = dimAverages.length > 0;
  const hasDemoData = Object.keys(crossData).length > 1;

  const batchCandidates = useMemo(() => {
    if (!results) return [];
    return results.filter((r) => r.userId && batchRiskFilter.includes(r.riskLevel || ''));
  }, [results, batchRiskFilter]);

  const handleBatchCreateEpisodes = async () => {
    if (batchCandidates.length === 0) return;
    setBatchCreating(true);
    setBatchCreatedCount(0);
    let created = 0;
    const seen = new Set<string>();
    for (const r of batchCandidates) {
      if (!r.userId || seen.has(r.userId)) continue;
      seen.add(r.userId);
      try {
        await createEpisode.mutateAsync({
          clientId: r.userId,
          chiefComplaint: `筛查结果：${assessment.title}，总分 ${r.totalScore}，风险等级 ${RISK_LABELS[r.riskLevel || 'level_1'] || r.riskLevel}`,
        });
        created++;
        setBatchCreatedCount(created);
      } catch { /* Skip — user may already have an active episode */ }
    }
    setBatchCreating(false);
    setShowBatchCreate(false);
    toast(`已为 ${created} 位来访者创建个案`, 'success');
  };

  return (
    <div className="space-y-4">
      {/* Config */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h3 className="text-sm font-medium text-slate-900">测评配置</h3>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div><span className="text-slate-400">类型</span><p className="text-slate-700 font-medium">{ASSESSMENT_TYPE_LABELS[assessmentType]}</p></div>
          <div><span className="text-slate-400">收集方式</span><p className="text-slate-700 font-medium">{COLLECT_MODE_LABELS[assessment.collectMode] || assessment.collectMode}</p></div>
          <div><span className="text-slate-400">区块</span><p className="text-slate-700 font-medium">{blocks.length} 个</p></div>
          <div><span className="text-slate-400">量表</span><p className="text-slate-700 font-medium">{blocks.filter((b) => b.type === 'scale').length} 个</p></div>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-medium text-slate-900 mb-3">作答统计</h3>
        <div className="grid grid-cols-5 gap-3">
          <ScoreCard label="已提交" value={results?.length || 0} />
          {['level_1', 'level_2', 'level_3', 'level_4'].map((level) => (
            <ScoreCard key={level} label={RISK_LABELS[level]} value={riskDist[level] || 0} />
          ))}
        </div>
      </div>

      {/* Batch create episodes from screening */}
      {hasRiskData && assessmentType === 'screening' && (riskDist.level_3 || riskDist.level_4) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">
                发现 {(riskDist.level_3 || 0) + (riskDist.level_4 || 0)} 位高风险来访者
              </span>
            </div>
            <button
              onClick={() => setShowBatchCreate(true)}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-500 transition flex items-center gap-1.5"
            >
              <FolderPlus className="w-3.5 h-3.5" /> 批量建案
            </button>
          </div>

          {showBatchCreate && (
            <div className="mt-4 pt-4 border-t border-amber-200 space-y-3">
              <p className="text-xs text-amber-700">选择需要建案的风险等级：</p>
              <div className="flex gap-2">
                {['level_2', 'level_3', 'level_4'].map((level) => {
                  const count = riskDist[level] || 0;
                  if (count === 0) return null;
                  const checked = batchRiskFilter.includes(level);
                  return (
                    <label key={level} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-xs transition ${
                      checked ? 'border-amber-500 bg-white' : 'border-amber-200 bg-amber-50/50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setBatchRiskFilter((prev) =>
                          prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level],
                        )}
                        className="rounded text-amber-600"
                      />
                      <span>{RISK_LABELS[level]}</span>
                      <span className="font-medium">{count} 人</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-600">
                  将为 {batchCandidates.length} 位来访者创建个案（已去重）
                  {batchCreating && ` — 已创建 ${batchCreatedCount}`}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setShowBatchCreate(false)} className="px-3 py-1.5 text-xs text-amber-700 hover:text-amber-900">取消</button>
                  <button
                    onClick={handleBatchCreateEpisodes}
                    disabled={batchCreating || batchCandidates.length === 0}
                    className="px-4 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-500 transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {batchCreating ? <><Loader2 className="w-3 h-3 animate-spin" /> 创建中...</> : '确认批量建案'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts */}
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

      {/* Cross analysis */}
      {hasDemoData && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-medium text-slate-900 mb-3">人口学交叉分析</h3>
          <CrossAnalysisChart data={crossData} groupLabel="分组" />
        </div>
      )}

      {/* Distribution records */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-900">发放记录 ({distributions?.length || 0})</h3>
          <button
            onClick={() => {
              const count = (distributions?.length || 0) + 1;
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
        {!distributions || distributions.length === 0 ? (
          <p className="text-sm text-slate-400">暂无发放记录</p>
        ) : (
          <div className="space-y-2">
            {distributions.map((d: Distribution, i: number) => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-700">{d.batchLabel || `第 ${distributions.length - i} 次`}</span>
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
  );
}

import React from 'react';
import { useCaseProgressReport } from '../../../api/useAI';
import { Sparkles, Loader2, TrendingUp, TrendingDown, Minus, Copy, CheckCircle2 } from 'lucide-react';

const trendIcons: Record<string, React.ReactNode> = {
  improving: <TrendingUp className="w-4 h-4 text-emerald-500" />,
  stable: <Minus className="w-4 h-4 text-slate-400" />,
  worsening: <TrendingDown className="w-4 h-4 text-red-500" />,
};

const trendLabels: Record<string, string> = {
  improving: '好转', stable: '稳定', worsening: '恶化',
};

const riskLabels: Record<string, string> = {
  level_1: '一般', level_2: '关注', level_3: '严重', level_4: '危机',
};

const goalStatusLabels: Record<string, string> = {
  active: '进行中', achieved: '已达成', revised: '已调整', dropped: '已放弃',
};

interface Props {
  episodeId: string;
}

export function ProgressReportPanel({ episodeId }: Props) {
  const report = useCaseProgressReport();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (!report.data?.narrative) return;
    navigator.clipboard.writeText(report.data.narrative);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-4">
      {!report.data && (
        <button
          onClick={() => report.mutate({ episodeId })}
          disabled={report.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
        >
          {report.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> 生成进度报告中...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> 生成 AI 进度报告</>
          )}
        </button>
      )}

      {report.isError && (
        <div className="mt-2 text-xs text-red-500 bg-red-50 rounded-lg p-3">
          生成失败，请检查 AI 服务是否已配置
        </div>
      )}

      {report.data && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="w-4 h-4 text-brand-500" />
              AI 进度报告
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => report.mutate({ episodeId })}
                disabled={report.isPending}
                className="text-xs text-brand-600 hover:text-brand-700"
              >
                {report.isPending ? '重新生成中...' : '重新生成'}
              </button>
            </div>
          </div>

          {/* Period + Sessions */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>报告期间：{report.data.reportPeriod.from} ~ {report.data.reportPeriod.to}</span>
            <span>共 {report.data.sessionSummary.totalSessions} 次会谈</span>
          </div>

          {/* Key progress + assessment trend */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs font-medium text-slate-400 mb-2">关键进展</div>
              <div className="space-y-1">
                {report.data.sessionSummary.keyProgressPoints.map((p, i) => (
                  <div key={i} className="text-xs text-slate-600">• {p}</div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs font-medium text-slate-400 mb-2">评估变化</div>
              <div className="flex items-center gap-1.5 mb-1">
                {trendIcons[report.data.assessmentChanges.trend]}
                <span className="text-sm font-medium text-slate-700">
                  {trendLabels[report.data.assessmentChanges.trend] || report.data.assessmentChanges.trend}
                </span>
              </div>
              <div className="text-xs text-slate-500">{report.data.assessmentChanges.details}</div>
            </div>
          </div>

          {/* Goal progress */}
          {report.data.goalProgress.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-400 mb-2">目标进度</div>
              <div className="space-y-1.5">
                {report.data.goalProgress.map((g, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-xs flex-shrink-0 ${
                      g.status === 'achieved' ? 'bg-emerald-100 text-emerald-700' :
                      g.status === 'active' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {goalStatusLabels[g.status] || g.status}
                    </span>
                    <div>
                      <span className="text-slate-700">{g.goalDescription}</span>
                      {g.notes && <span className="text-slate-400 ml-1">— {g.notes}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk assessment */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400">当前风险：</span>
            <span className="font-medium text-slate-700">{riskLabels[report.data.riskAssessment.currentLevel] || report.data.riskAssessment.currentLevel}</span>
            <span className="text-slate-400">趋势：{report.data.riskAssessment.trend}</span>
          </div>

          {/* Narrative */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-slate-400">叙述性报告</div>
              <button onClick={handleCopy} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
                {copied ? <><CheckCircle2 className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
              </button>
            </div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {report.data.narrative}
            </div>
          </div>

          {/* Recommendations */}
          {report.data.recommendations.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-400 mb-1">后续建议</div>
              <div className="space-y-1">
                {report.data.recommendations.map((r, i) => (
                  <div key={i} className="text-xs text-slate-600">• {r}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { RiskBadge } from '../../../shared/components';
import { AlertTriangle, Target, FileText, TrendingUp } from 'lucide-react';
import type { CareEpisode } from '@psynote/shared';

const riskLabels: Record<string, string> = {
  level_1: '一般', level_2: '关注', level_3: '严重', level_4: '危机',
};

interface Props {
  episode: CareEpisode & { client?: { name: string; email?: string } };
  lastNoteSummary?: string;
  lastNoteDate?: string;
  recentAssessment?: { score: number; riskLevel: string; date: string };
  goalProgress?: { total: number; achieved: number };
  complianceScore?: number;
}

export function ClientSummaryCard({
  episode, lastNoteSummary, lastNoteDate, recentAssessment, goalProgress, complianceScore,
}: Props) {
  const isHighRisk = episode.currentRisk === 'level_3' || episode.currentRisk === 'level_4';

  return (
    <div className="p-4 space-y-4">
      {/* Client header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-bold text-slate-900">{episode.client?.name || '未知'}</span>
          <RiskBadge level={episode.currentRisk} />
        </div>
        {episode.chiefComplaint && (
          <p className="text-xs text-slate-500">{episode.chiefComplaint}</p>
        )}
      </div>

      {/* High risk alert */}
      {isHighRisk && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-700">
            当前风险等级为{riskLabels[episode.currentRisk]}，请关注来访者安全状况
          </div>
        </div>
      )}

      {/* Last note summary */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
          <FileText className="w-3 h-3" />
          上次笔记 {lastNoteDate || ''}
        </div>
        <p className="text-xs text-slate-600 line-clamp-3">
          {lastNoteSummary || '暂无会谈记录'}
        </p>
      </div>

      {/* Recent assessment */}
      {recentAssessment && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <TrendingUp className="w-3 h-3" />
            最近评估 {recentAssessment.date}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">{recentAssessment.score}分</span>
            <RiskBadge level={recentAssessment.riskLevel} />
          </div>
        </div>
      )}

      {/* Goal progress */}
      {goalProgress && goalProgress.total > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Target className="w-3 h-3" />
            治疗目标
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${(goalProgress.achieved / goalProgress.total) * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-500">{goalProgress.achieved}/{goalProgress.total}</span>
          </div>
        </div>
      )}

      {/* Compliance score */}
      {complianceScore !== undefined && (
        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="text-xs text-slate-400 mb-1">AI 合规评分</div>
          <div className={`text-lg font-bold ${
            complianceScore >= 90 ? 'text-emerald-600' :
            complianceScore >= 70 ? 'text-blue-600' :
            complianceScore >= 50 ? 'text-amber-600' : 'text-red-600'
          }`}>
            {complianceScore}
            <span className="text-xs text-slate-400 font-normal">/100</span>
          </div>
        </div>
      )}
    </div>
  );
}

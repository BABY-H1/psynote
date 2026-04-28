import React from 'react';
import { Loader2, User, Sparkles, AlertTriangle, ChevronRight } from 'lucide-react';
import { DEFAULT_TRIAGE_CONFIG } from '@psynote/shared';
import type {
  TriageCandidateRow,
  TriageMode,
} from '../../../api/useResearchTriage';

const LEVEL_COLOR: Record<string, string> = Object.fromEntries(
  DEFAULT_TRIAGE_CONFIG.levels.map((l) => [l.key, l.color]),
);
const LEVEL_LABEL: Record<string, string> = Object.fromEntries(
  DEFAULT_TRIAGE_CONFIG.levels.map((l) => [l.key, l.label]),
);

const KIND_LABEL: Record<string, string> = {
  crisis_candidate: '危机',
  episode_candidate: '个案',
  group_candidate: '团辅',
  course_candidate: '课程',
};

export function TriageCandidateList({
  rows,
  isLoading,
  isError,
  selectedKey,
  onSelect,
  mode,
}: {
  rows: TriageCandidateRow[];
  isLoading: boolean;
  isError: boolean;
  selectedKey: string | null;
  onSelect: (row: TriageCandidateRow) => void;
  mode: TriageMode;
}) {
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载中…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="h-full flex items-center justify-center text-rose-500 text-sm">
        加载失败
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm px-6 text-center">
        <User className="w-8 h-8 mb-2 text-slate-300" />
        当前筛选范围内没有待研判对象
        {mode === 'manual' && (
          <p className="text-[11px] text-slate-400 mt-2 max-w-xs">
            "手工候选"用来放咨询师在流程外手工加入研判的人。当前还没有手工添加入口,
            功能后续接入。
          </p>
        )}
      </div>
    );
  }

  return (
    // Phase J 后续: 去掉 rounded-2xl + border (WorkspaceLayout 边框接管).
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-500 flex items-center gap-2">
        <span className="font-semibold text-slate-700">共 {rows.length} 人</span>
        {mode === 'all' && <span className="text-slate-400">· 筛查 + 手工</span>}
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {rows.map((row) => {
          const k = row.resultId ?? row.candidateId ?? '';
          const selected = k === selectedKey;
          const color = row.riskLevel ? LEVEL_COLOR[row.riskLevel] : '#cbd5e1';
          const label = row.riskLevel ? LEVEL_LABEL[row.riskLevel] ?? row.riskLevel : '未分级';
          const kindLabel = row.candidateKind ? KIND_LABEL[row.candidateKind] : null;
          // Phase J: crisis_candidate accepted = 已转入危机处置工作流.
          // List 拿不到 crisis_case.stage, 所以这里显示中性的 "处置中" 角标
          // (实际是否结案要看右栏 panel 里 crisisCase.stage). 70% 透明度让
          // row 视觉次要, 用户依然能点开看清单做审计回溯.
          const isCrisisInProgress =
            row.candidateKind === 'crisis_candidate' &&
            row.candidateStatus === 'accepted';
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelect(row)}
              className={`w-full text-left px-4 py-3 transition flex items-center gap-3 ${
                /* Phase J 视觉 fix: selected 时整行 bg-brand-50 + ring-2,
                   左竖条改 brand 色实色, 跟 level 色解绑, 避免 L3/L4 暖色
                   跟 brand-50 冷色叠层产生视觉噪声. badge 仍保留 level 色
                   (L 等级语义需要颜色看). */
                selected
                  ? 'bg-brand-50 ring-2 ring-brand-300 ring-inset'
                  : 'hover:bg-slate-50'
              } ${isCrisisInProgress ? 'opacity-70' : ''}`}
            >
              <span
                className="w-1 h-10 rounded-full flex-shrink-0"
                style={{ backgroundColor: selected ? '#3b82f6' : color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 truncate">
                    {row.userName ?? '(匿名来访者)'}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                    style={{ backgroundColor: color + '33', color }}
                  >
                    {label}
                  </span>
                  {row.source === 'manual' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-0.5 flex-shrink-0">
                      <AlertTriangle className="w-2.5 h-2.5" /> 手工
                    </span>
                  )}
                  {kindLabel && !isCrisisInProgress && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700 flex items-center gap-0.5 flex-shrink-0">
                      <Sparkles className="w-2.5 h-2.5" />
                      {kindLabel}候选
                    </span>
                  )}
                  {isCrisisInProgress && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex-shrink-0">
                      危机处置中
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                  {row.assessmentTitle ?? row.suggestion ?? '—'}
                  {row.totalScore != null && <span className="ml-2">总分 {row.totalScore}</span>}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {new Date(row.createdAt).toLocaleString('zh-CN')}
                  {row.candidateStatus && row.candidateStatus !== 'pending' && !isCrisisInProgress && (
                    <span className="ml-2 text-slate-500">
                      · {row.candidateStatus === 'accepted' ? '已处理' : row.candidateStatus}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

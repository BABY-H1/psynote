/**
 * 研判分流 (Research & Triage) — L1-L4 decision workbench over the
 * screening-type assessment results, plus a forward-compatible scaffold
 * for manually-added triage targets.
 *
 * Layout:
 *   [TopFilterBar]   [筛查测评 | 手工候选 | 全部] + batch/assessment filters
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Level sidebar │ Candidate list │ Detail + action bar         │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Intake-type候选在交付中心(团辅/课程详情 → 候选 tab)处理,不在这里。
 */
import React, { useState } from 'react';
import { DEFAULT_TRIAGE_CONFIG } from '@psynote/shared';
import { TopFilterBar } from './components/TopFilterBar';
import { LevelBucketSidebar } from './components/LevelBucketSidebar';
import { TriageCandidateList } from './components/TriageCandidateList';
import { TriageDetailPanel } from './components/TriageDetailPanel';
import { WorkspaceLayout } from '../counseling/components/WorkspaceLayout';
import {
  useTriageCandidates,
  useTriageBuckets,
  type TriageCandidateRow,
  type TriageMode,
} from '../../api/useResearchTriage';

export function ResearchTriagePage() {
  const [mode, setMode] = useState<TriageMode>('screening');
  const [batchId, setBatchId] = useState<string | undefined>(undefined);
  const [assessmentId, setAssessmentId] = useState<string | undefined>(undefined);
  const [selectedLevel, setSelectedLevel] = useState<string | undefined>(undefined);
  const [selectedRow, setSelectedRow] = useState<TriageCandidateRow | null>(null);

  const filters = { mode, batchId, assessmentId };
  const bucketsQuery = useTriageBuckets({ batchId, assessmentId });
  const listQuery = useTriageCandidates({ ...filters, level: selectedLevel });

  const levels = DEFAULT_TRIAGE_CONFIG.levels;

  return (
    <div className="h-full flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">研判分流</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          筛查测评结果按 L1-L4 分级，逐人决定下一步动作
        </p>
      </div>

      <TopFilterBar
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          setSelectedRow(null);
        }}
        batchId={batchId}
        onBatchChange={(b) => {
          setBatchId(b);
          setSelectedRow(null);
        }}
        assessmentId={assessmentId}
        onAssessmentChange={(a) => {
          setAssessmentId(a);
          setBatchId(undefined);
          setSelectedRow(null);
        }}
      />

      {/*
       * Phase J 后续: 三栏从 grid 写死宽度改成 WorkspaceLayout (复用
       * EpisodeDetail 的可调宽 + 独立 scroll). 用户拖中间两条 resize handle
       * 调整 left/right 宽度, 各栏内部 overflow-y-auto 自由滚动.
       *
       * 默认宽度: left=240 (4 个 bucket + 全部/未分级), right=520 (CrisisChecklistPanel
       * 内容多, 给较大空间). center 用 flex-1 自动撑满.
       */}
      <div className="flex-1 min-h-0">
        <WorkspaceLayout
          defaultLeftWidth={240}
          defaultRightWidth={520}
          minWidth={180}
          /* 让右栏 (含 picker / 危机清单) 可拖到三栏一半 = container 50%, 不再被
             默认 40% max 卡住, 用户能用更宽空间挑课程/团辅或处理危机清单. */
          maxRatio={0.5}
          left={
            <LevelBucketSidebar
              levels={levels}
              buckets={bucketsQuery.data}
              selectedLevel={selectedLevel}
              onSelect={(lvl) => {
                setSelectedLevel(lvl);
                setSelectedRow(null);
              }}
              isLoading={bucketsQuery.isLoading}
              disabled={mode === 'manual'}
            />
          }
          center={
            <TriageCandidateList
              rows={listQuery.data ?? []}
              isLoading={listQuery.isLoading}
              isError={listQuery.isError}
              selectedKey={selectedRow ? keyOf(selectedRow) : null}
              onSelect={setSelectedRow}
              mode={mode}
            />
          }
          right={
            <TriageDetailPanel
              row={selectedRow}
              onCleared={() => setSelectedRow(null)}
              onActionDone={() => {
                bucketsQuery.refetch();
                listQuery.refetch();
              }}
            />
          }
        />
      </div>
    </div>
  );
}

/**
 * 复合 key — 防止"一点选中两行"的 bug.
 *
 * 当一个 result 同时有多个 candidate (e.g. 既有 course_candidate 又有
 * episode_candidate) 时, queryScreening LEFT JOIN candidate_pool 会返回
 * 多行, 每行 resultId 相同但 candidateId 不同. 之前 `resultId ?? candidateId`
 * 优先用 resultId, 两行共享同一个 selectedKey → 同时高亮.
 *
 * 用 resultId:candidateId 复合键, 每行都唯一.
 */
function keyOf(row: TriageCandidateRow): string {
  return `${row.resultId ?? '_'}:${row.candidateId ?? '_'}`;
}

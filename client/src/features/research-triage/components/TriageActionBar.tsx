import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Flame, UserPlus, BookOpen, XCircle, Loader2,
} from 'lucide-react';
import { DEFAULT_TRIAGE_CONFIG } from '@psynote/shared';
import { useToast } from '../../../shared/components';
import {
  useAcceptCandidate,
  useDismissCandidate,
} from '../../../api/useWorkflow';
import { useUpdateRiskLevel } from '../../../api/useResearchTriage';
import type { TriageCandidateRow } from '../../../api/useResearchTriage';

/**
 * Per-row action bar. Four groups of next-step actions:
 *   1. 确认/调整 L 级别 — overrides assessment_results.riskLevel
 *   2. 转个案 / 开危机案 — reuses candidate-pool accept flow
 *      (only available when the row has an associated candidate_pool entry)
 *   3. 课程 / 团辅 — placeholder buttons, wired to candidate accept too
 *   4. 忽略 — dismiss candidate with reason
 */
export function TriageActionBar({
  row,
  onActionDone,
}: {
  row: TriageCandidateRow;
  onActionDone: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const updateLevel = useUpdateRiskLevel();
  const accept = useAcceptCandidate();
  const dismiss = useDismissCandidate();

  const [pickingLevel, setPickingLevel] = useState(false);
  const busy = updateLevel.isPending || accept.isPending || dismiss.isPending;

  const isCrisis = row.riskLevel === 'level_4' || row.candidateKind === 'crisis_candidate';
  const hasCandidate = !!row.candidateId;

  async function confirmLevel(level: 'level_1' | 'level_2' | 'level_3' | 'level_4') {
    if (!row.resultId) {
      toast('此条目没有测评结果，无法调级', 'error');
      return;
    }
    try {
      await updateLevel.mutateAsync({ resultId: row.resultId, riskLevel: level });
      toast('已更新分级', 'success');
      setPickingLevel(false);
      onActionDone();
    } catch (err) {
      toast((err as Error).message || '更新失败', 'error');
    }
  }

  async function acceptCandidate(resolvedRefType?: string) {
    if (!row.candidateId) {
      toast('该条目尚未进入候选池，请先由系统生成候选', 'info');
      return;
    }
    try {
      const result = await accept.mutateAsync({
        id: row.candidateId,
        resolvedRefType,
      });
      toast('已接受候选', 'success');
      onActionDone();
      // Navigate to the newly created entity when the server returns a ref
      const ref = (result as unknown as { resolvedRefType?: string; resolvedRefId?: string });
      if (ref.resolvedRefType === 'crisis_case' || ref.resolvedRefType === 'care_episode') {
        // crisis case accept returns episodeId via resolvedRefId on care_episode
        const episodeId = (result as any).episodeId || ref.resolvedRefId;
        if (episodeId) navigate(`/episodes/${episodeId}?mode=crisis`);
      }
    } catch (err) {
      toast((err as Error).message || '操作失败', 'error');
    }
  }

  async function dismissRow() {
    if (!row.candidateId) {
      toast('非候选池条目无法忽略', 'info');
      return;
    }
    const reason = window.prompt('忽略理由（可选）');
    try {
      await dismiss.mutateAsync({ id: row.candidateId, reason: reason ?? undefined });
      toast('已忽略', 'success');
      onActionDone();
    } catch (err) {
      toast((err as Error).message || '操作失败', 'error');
    }
  }

  return (
    <div className="border-t border-slate-100 p-3 bg-slate-50/70">
      {pickingLevel ? (
        <div className="space-y-2">
          <div className="text-xs text-slate-600 mb-1">选择正确的分级：</div>
          <div className="grid grid-cols-4 gap-2">
            {DEFAULT_TRIAGE_CONFIG.levels.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => confirmLevel(l.key as any)}
                disabled={busy}
                className="text-xs px-2 py-1.5 rounded-lg border font-medium disabled:opacity-50"
                style={{ borderColor: l.color, color: l.color }}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPickingLevel(false)}
            className="text-[11px] text-slate-500 hover:text-slate-700 mt-1"
          >
            取消
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <ActionButton
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            label="确认/调整级别"
            onClick={() => setPickingLevel(true)}
            disabled={busy || !row.resultId}
            tone="slate"
          />
          <ActionButton
            icon={<UserPlus className="w-3.5 h-3.5" />}
            label={isCrisis ? '开危机处置' : '转个案'}
            onClick={() => acceptCandidate(isCrisis ? 'crisis_case' : 'care_episode')}
            disabled={busy || !hasCandidate}
            tone={isCrisis ? 'rose' : 'blue'}
          />
          <ActionButton
            icon={<BookOpen className="w-3.5 h-3.5" />}
            label="课程 / 团辅"
            onClick={() => acceptCandidate('course_enrollment')}
            disabled={busy || !hasCandidate}
            tone="teal"
          />
          <ActionButton
            icon={busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            label="忽略"
            onClick={dismissRow}
            disabled={busy || !hasCandidate}
            tone="slate-muted"
          />
        </div>
      )}
      {!hasCandidate && row.resultId && (
        <p className="text-[11px] text-slate-400 mt-2">
          提示：此测评结果尚未落入候选池，先在协作中心"待处理候选"里手动创建候选，再回来执行动作。
        </p>
      )}
    </div>
  );
}

function ActionButton({
  icon, label, onClick, disabled, tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone: 'slate' | 'blue' | 'rose' | 'teal' | 'slate-muted';
}) {
  const toneClass = {
    slate: 'border-slate-300 text-slate-700 hover:bg-slate-100',
    blue: 'border-blue-400 text-blue-700 hover:bg-blue-50',
    rose: 'border-rose-400 text-rose-700 hover:bg-rose-50',
    teal: 'border-teal-400 text-teal-700 hover:bg-teal-50',
    'slate-muted': 'border-slate-200 text-slate-500 hover:bg-slate-100',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${toneClass}`}
    >
      {icon}
      {label}
    </button>
  );
}

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
import {
  useUpdateRiskLevel,
  useLazyCreateCandidate,
  type CandidateKind,
} from '../../../api/useResearchTriage';
import type { TriageCandidateRow } from '../../../api/useResearchTriage';

/**
 * Per-row action bar. Four groups of next-step actions:
 *   1. 确认/调整 L 级别 — overrides assessment_results.riskLevel
 *   2. 转个案 / 开危机案 — reuses candidate-pool accept flow
 *   3. 课程 / 团辅 — wired to candidate accept (resolvedRefType='course_enrollment')
 *   4. 忽略 — dismiss candidate
 *
 * Phase H (BUG-007 真正修复): 之前 2/3/4 三类按钮要求 row.candidateId 已存在,
 * 但 candidate_pool 行只在工作流规则引擎触发时产生, 没规则的机构永远 disabled.
 * 现在改成 ensure-then-act: 用户点击时如果 candidateId 缺失, 先 POST
 * /triage/results/:id/candidate 把 result 懒转成 candidate_pool 行
 * (sourceRuleId=null), 再立即走原 accept/dismiss 流程. 中间步骤对用户不可见.
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
  const lazyCreate = useLazyCreateCandidate();

  const [pickingLevel, setPickingLevel] = useState(false);
  const busy = updateLevel.isPending || accept.isPending || dismiss.isPending || lazyCreate.isPending;

  const isCrisis = row.riskLevel === 'level_4' || row.candidateKind === 'crisis_candidate';

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

  /**
   * 确保有 candidateId 可用. 已有就直接返回, 没就 lazy create.
   * 服务端幂等, 重复调用不会产生重复行.
   */
  async function ensureCandidate(kind: CandidateKind): Promise<string> {
    if (row.candidateId) return row.candidateId;
    if (!row.resultId) {
      throw new Error('此条目没有测评结果，无法创建候选');
    }
    const created = await lazyCreate.mutateAsync({
      resultId: row.resultId,
      kind,
      priority: row.riskLevel === 'level_4' ? 'urgent' : 'normal',
    });
    return created.id;
  }

  async function acceptCandidate(resolvedRefType?: string) {
    try {
      // resolvedRefType 决定 candidate kind: crisis_case → crisis_candidate,
      // course_enrollment → course_candidate, 其他 (含 care_episode) → episode_candidate.
      const kind: CandidateKind =
        resolvedRefType === 'crisis_case' ? 'crisis_candidate'
        : resolvedRefType === 'course_enrollment' ? 'course_candidate'
        : 'episode_candidate';
      const candidateId = await ensureCandidate(kind);
      const result = await accept.mutateAsync({ id: candidateId, resolvedRefType });
      toast('已接受候选', 'success');
      onActionDone();
      // Navigate to the newly created entity when the server returns a ref.
      // - crisis_case: 跳 /episodes/:id?mode=crisis (危机清单)
      // - care_episode: 跳 /episodes/:id (普通个案)
      // - course_enrollment: 服务端目前只 stamp, 不跳 (用户在 delivery 自己选)
      const ref = result as unknown as { resolvedRefType?: string; resolvedRefId?: string; episodeId?: string };
      if (ref.resolvedRefType === 'crisis_case') {
        const episodeId = ref.episodeId || ref.resolvedRefId;
        if (episodeId) navigate(`/episodes/${episodeId}?mode=crisis`);
      } else if (ref.resolvedRefType === 'care_episode') {
        const episodeId = ref.episodeId || ref.resolvedRefId;
        if (episodeId) navigate(`/episodes/${episodeId}`);
      }
    } catch (err) {
      toast((err as Error).message || '操作失败', 'error');
    }
  }

  async function dismissRow() {
    if (!row.resultId && !row.candidateId) {
      toast('该条目无法忽略', 'info');
      return;
    }
    const reason = window.prompt('忽略理由（可选）');
    try {
      const candidateId = await ensureCandidate(
        // 忽略的语义比较中性, 默认按 episode_candidate 落库即可 — 不会真的产生 episode,
        // dismiss 后 status='dismissed' 而非 'accepted'.
        (isCrisis ? 'crisis_candidate' : 'episode_candidate') as CandidateKind,
      );
      await dismiss.mutateAsync({ id: candidateId, reason: reason ?? undefined });
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
            disabled={busy || !row.resultId}
            tone={isCrisis ? 'rose' : 'blue'}
          />
          <ActionButton
            icon={<BookOpen className="w-3.5 h-3.5" />}
            label="课程 / 团辅"
            onClick={() => acceptCandidate('course_enrollment')}
            disabled={busy || !row.resultId}
            tone="teal"
          />
          <ActionButton
            icon={busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            label="忽略"
            onClick={dismissRow}
            disabled={busy || !row.resultId}
            tone="slate-muted"
          />
        </div>
      )}
      {/*
        Phase H (BUG-007 真正修复): 之前这里有一段提示 "候选池由规则引擎产生,
        未配置规则时这些按钮 disabled, 请到交付中心绕一圈". 现在按钮直接
        work (lazy create candidate), 提示已不需要 → 删除.
      */}
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

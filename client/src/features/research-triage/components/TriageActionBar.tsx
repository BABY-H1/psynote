import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, UserPlus, BookOpen, Users, Loader2,
} from 'lucide-react';
import { DEFAULT_TRIAGE_CONFIG } from '@psynote/shared';
import { useToast } from '../../../shared/components';
import { useAcceptCandidate } from '../../../api/useWorkflow';
import {
  useUpdateRiskLevel,
  useLazyCreateCandidate,
  type CandidateKind,
} from '../../../api/useResearchTriage';
import type { TriageCandidateRow } from '../../../api/useResearchTriage';

/**
 * Per-row action bar. Four groups of next-step actions:
 *   1. 确认/调整 L 级别 — overrides assessment_results.riskLevel (inline picker)
 *   2. 转个案 / 开危机处置 — accept → 创建 episode (普通) 或留在分诊跑清单 (危机)
 *   3. 课程 — 上抛 onPickerOpen('course') 让 detail 切 inline picker (Phase J 后续)
 *   4. 团辅 — 上抛 onPickerOpen('group') 让 detail 切 inline picker (Phase J 后续)
 *
 * 不再有"忽略" — 用户决定: alpha 阶段研判分流的目标是把人推进下一步,
 * "忽略" 语义跟"调级到 L1"重合, 砍掉减少认知负担.
 */
export function TriageActionBar({
  row,
  onActionDone,
  onCrisisStarted,
  onPickerOpen,
}: {
  row: TriageCandidateRow;
  onActionDone: () => void;
  onCrisisStarted?: (episodeId: string) => void;
  /**
   * 课程 / 团辅按钮被点 → 通知上层 detail panel 切到对应 inline picker.
   * 注意: 实际 "选哪个具体 instance + 报名 + accept candidate" 由 picker 处理,
   * ActionBar 只负责开 picker.
   */
  onPickerOpen?: (kind: 'course' | 'group') => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const updateLevel = useUpdateRiskLevel();
  const accept = useAcceptCandidate();
  const lazyCreate = useLazyCreateCandidate();

  const [pickingLevel, setPickingLevel] = useState(false);
  const busy = updateLevel.isPending || accept.isPending || lazyCreate.isPending;

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
      const ref = result as unknown as { resolvedRefType?: string; resolvedRefId?: string; episodeId?: string };
      // Phase J: crisis 路径留在研判中心, 上抛 episodeId 让 detail panel
      // 切到 CrisisChecklistPanel. 不再 navigate 到 /episodes/:id?mode=crisis.
      if (ref.resolvedRefType === 'crisis_case') {
        const episodeId = ref.episodeId || ref.resolvedRefId;
        if (episodeId && onCrisisStarted) onCrisisStarted(episodeId);
      } else if (ref.resolvedRefType === 'care_episode') {
        // 非危机的"转个案"仍跳 EpisodeDetail (常规咨询工作台)
        const episodeId = ref.episodeId || ref.resolvedRefId;
        if (episodeId) navigate(`/episodes/${episodeId}`);
      }
      // course_enrollment: 服务端 stamp 后不跳 (用户在 delivery 自己选具体课程)
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
            label="课程"
            onClick={() => onPickerOpen?.('course')}
            disabled={busy || !row.resultId || !row.userId}
            tone="teal"
          />
          <ActionButton
            icon={<Users className="w-3.5 h-3.5" />}
            label="团辅"
            onClick={() => onPickerOpen?.('group')}
            disabled={busy || !row.resultId || !row.userId}
            tone="violet"
          />
        </div>
      )}
      {busy && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-2 justify-center">
          <Loader2 className="w-3 h-3 animate-spin" />
          处理中…
        </div>
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
  tone: 'slate' | 'blue' | 'rose' | 'teal' | 'violet';
}) {
  const toneClass = {
    slate: 'border-slate-300 text-slate-700 hover:bg-slate-100',
    blue: 'border-blue-400 text-blue-700 hover:bg-blue-50',
    rose: 'border-rose-400 text-rose-700 hover:bg-rose-50',
    teal: 'border-teal-400 text-teal-700 hover:bg-teal-50',
    violet: 'border-violet-400 text-violet-700 hover:bg-violet-50',
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

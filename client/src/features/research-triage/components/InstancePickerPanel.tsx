import React, { useState } from 'react';
import { Loader2, BookOpen, Users, Plus } from 'lucide-react';
import { useGroupInstances, useEnrollInGroup } from '../../../api/useGroups';
import {
  useCourseInstances,
  useAssignToInstance,
} from '../../../api/useCourseInstances';
import { useAcceptCandidate } from '../../../api/useWorkflow';
import {
  useLazyCreateCandidate,
  type CandidateKind,
} from '../../../api/useResearchTriage';
import { useToast } from '../../../shared/components';
import type { TriageCandidateRow } from '../../../api/useResearchTriage';

/**
 * Inline 课程 / 团辅 picker — Phase J 后续.
 *
 * 由 TriageDetailPanel 在用户点 "课程" / "团辅" 按钮时挂载. 列出当前 org
 * 的可选 instance, 用户点行 → 一键报名 + accept candidate (resolvedRefType
 * 'course_enrollment' / 'group_enrollment'), 不需要离开研判分流.
 *
 * 流程:
 *   1. ensureCandidate(course_candidate / group_candidate) — lazy create 防
 *      手工候选机构没有 candidate_pool 行
 *   2. enroll (POST course-instances/:id/assign 或 group-instances/:id/enroll)
 *   3. accept candidate (resolvedRefType + resolvedRefId=instanceId, 让 row
 *      变成 "已处理" 状态)
 *   4. toast + 关闭 picker
 */
export function InstancePickerPanel({
  kind,
  row,
  onClose,
  onPickDone,
}: {
  kind: 'course' | 'group';
  row: TriageCandidateRow;
  onClose: () => void;
  onPickDone: () => void;
}) {
  const { toast } = useToast();
  const lazyCreate = useLazyCreateCandidate();
  const accept = useAcceptCandidate();
  const enrollInGroup = useEnrollInGroup();
  const assignToCourse = useAssignToInstance();

  // 显示所有"还能加人"的 instance — 排除 closed/archived/completed.
  // 包含 draft (筹备中, 团辅常见, 还在招募阶段就要研判分流派人).
  const groups = useGroupInstances();
  const courses = useCourseInstances();

  const isCourse = kind === 'course';
  const isLoading = isCourse ? courses.isLoading : groups.isLoading;
  const items = isCourse
    ? (courses.data ?? []).filter(
        (c) => !['closed', 'archived', 'completed'].includes(c.status as string),
      )
    : (groups.data ?? []).filter(
        (g) => !['closed', 'archived', 'completed'].includes(g.status as string),
      );
  const [picking, setPicking] = useState<string | null>(null);

  const Icon = isCourse ? BookOpen : Users;
  const candidateKind: CandidateKind = isCourse ? 'course_candidate' : 'group_candidate';
  const resolvedRefType = isCourse ? 'course_enrollment' : 'group_enrollment';

  async function ensureCandidate(): Promise<string> {
    if (row.candidateId) return row.candidateId;
    if (!row.resultId) throw new Error('该条目没有测评结果, 无法创建候选');
    const created = await lazyCreate.mutateAsync({
      resultId: row.resultId,
      kind: candidateKind,
      priority: row.riskLevel === 'level_4' ? 'urgent' : 'normal',
    });
    return created.id;
  }

  async function handlePick(instanceId: string, instanceTitle: string) {
    if (!row.userId) {
      toast('该候选没有关联来访者, 无法报名', 'error');
      return;
    }
    setPicking(instanceId);
    try {
      // 1) 确保候选存在 (lazy create 兜底)
      const candidateId = await ensureCandidate();
      // 2) 报名 — course 用 assign, group 用 enroll
      if (isCourse) {
        await assignToCourse.mutateAsync({
          instanceId,
          userIds: [row.userId],
        });
      } else {
        await enrollInGroup.mutateAsync({
          instanceId,
          screeningResultId: row.resultId ?? undefined,
        });
      }
      // 3) accept 候选, 标记 resolvedRef 指向具体 instance
      await accept.mutateAsync({
        id: candidateId,
        resolvedRefType,
        resolvedRefId: instanceId,
      });
      toast(`已报名到「${instanceTitle}」`, 'success');
      onPickDone();
      onClose();
    } catch (err: any) {
      toast(err?.message || '报名失败', 'error');
    } finally {
      setPicking(null);
    }
  }

  return (
    // 不再渲染 header — 按钮 active 态已经表明"在选什么", 关闭 picker 通过
    // 再次点 active 按钮 (toggle, TriageDetailPanel 控制). 跟 ActionBar
    // 的 bg-slate-50/70 一致, 视觉上跟按钮区在同一个框内.
    <div className="h-full flex flex-col bg-slate-50/70">
      {/* List 直接占满 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-400">
            <Icon className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            当前没有可用的{isCourse ? '课程' : '团辅'}, 请先在「交付中心 →
            {isCourse ? '课程' : '团辅'}」创建.
          </div>
        ) : (
          items.map((it) => (
            <InstanceRow
              key={it.id}
              kind={kind}
              instance={it}
              picking={picking === it.id}
              disabled={picking !== null && picking !== it.id}
              onPick={() => handlePick(it.id, it.title)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function InstanceRow({
  kind,
  instance,
  picking,
  disabled,
  onPick,
}: {
  kind: 'course' | 'group';
  instance: any;
  picking: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  // 共通字段: title / description / capacity / status / startDate
  const cap = instance.capacity;
  const meta: string[] = [];
  if (kind === 'course' && instance.publishMode) meta.push(instance.publishMode);
  if (kind === 'group' && instance.category) meta.push(instance.category);
  if (instance.startDate) {
    meta.push(new Date(instance.startDate).toLocaleDateString('zh-CN'));
  }

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled || picking}
      className="w-full text-left border border-slate-200 rounded-xl p-3 hover:bg-slate-50 hover:border-brand-300 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-start gap-3"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-slate-900 truncate">
            {instance.title}
          </span>
          {instance.status && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 flex-shrink-0">
              {instance.status}
            </span>
          )}
        </div>
        {instance.description && (
          <div className="text-[11px] text-slate-500 line-clamp-2 mb-1">
            {instance.description}
          </div>
        )}
        <div className="text-[10px] text-slate-400 flex items-center gap-2 flex-wrap">
          {meta.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
          {cap != null && <span>· 容量 {cap}</span>}
        </div>
      </div>
      <div className="flex-shrink-0">
        {picking ? (
          <Loader2 className="w-4 h-4 animate-spin text-brand-500 mt-1" />
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-brand-700 bg-brand-50 px-2 py-1 rounded-lg font-medium">
            <Plus className="w-3 h-3" />
            加入
          </span>
        )}
      </div>
    </button>
  );
}

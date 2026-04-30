import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import { useToast } from '../Toast';
import {
  useServiceCandidates,
  type ServiceCandidateType,
} from '../../../api/useServiceCandidates';
import {
  useAcceptCandidate,
  useDismissCandidate,
} from '../../../api/useWorkflow';

/**
 * Shared 候选 tab for GroupInstanceDetail / CourseInstanceDetail.
 *
 * Rows come from candidate_pool entries whose target_group_instance_id /
 * target_course_instance_id equals this service's id. Accepting a row
 * triggers the standard candidate accept flow (resolvedRefType handled
 * server-side for crisis, otherwise the caller decides).
 */
export function ServiceCandidatesTab({
  serviceType,
  instanceId,
}: {
  serviceType: ServiceCandidateType;
  instanceId: string;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useServiceCandidates(serviceType, instanceId);
  const accept = useAcceptCandidate();
  const dismiss = useDismissCandidate();

  async function onAccept(candidateId: string) {
    try {
      const result = await accept.mutateAsync({ id: candidateId });
      toast('已接受候选', 'success');
      qc.invalidateQueries({ queryKey: ['service-candidates'] });
      const episodeId = (result as any).episodeId;
      if (episodeId) {
        navigate(`/episodes/${episodeId}`);
      }
    } catch (err) {
      toast((err as Error).message || '操作失败', 'error');
    }
  }

  async function onDismiss(candidateId: string) {
    const reason = window.prompt('忽略理由（可选）');
    try {
      await dismiss.mutateAsync({ id: candidateId, reason: reason ?? undefined });
      toast('已忽略', 'success');
      qc.invalidateQueries({ queryKey: ['service-candidates'] });
    } catch (err) {
      toast((err as Error).message || '操作失败', 'error');
    }
  }

  if (isLoading) {
    return (
      <div className="py-12 flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载候选名单…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-8 text-center text-sm text-rose-600">加载失败</div>
    );
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-sm px-6 text-center">
        <Sparkles className="w-8 h-8 mb-2 text-slate-300" />
        暂无候选对象
        <p className="text-[11px] text-slate-400 mt-2 max-w-sm">
          候选由筛查/入组测评触发的工作流规则产生。
          在测评的规则配置里指定目标{serviceType === 'group' ? '团辅' : '课程'}实例后,
          命中的来访者会出现在这里。
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">共 {rows.length} 人等待处理</span>
        <span className="ml-2 text-slate-400">
          · 来源：测评触发的工作流规则
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div
            key={row.candidateId}
            className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition"
          >
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {(row.userName || '?').charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 truncate">
                  {row.userName ?? '(匿名来访者)'}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${priorityClass(row.priority)}`}
                >
                  {priorityLabel(row.priority)}
                </span>
              </div>
              <div className="text-xs text-slate-600 mt-0.5 truncate">
                {row.suggestion}
              </div>
              {row.reason && (
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">{row.reason}</div>
              )}
              <div className="text-[10px] text-slate-400 mt-0.5">
                {new Date(row.createdAt).toLocaleString('zh-CN')}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => onAccept(row.candidateId)}
                disabled={accept.isPending}
                className="px-2 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 rounded-md flex items-center gap-1 disabled:opacity-40"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> 接受
              </button>
              <button
                type="button"
                onClick={() => onDismiss(row.candidateId)}
                disabled={dismiss.isPending}
                className="px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-md flex items-center gap-1 disabled:opacity-40"
              >
                <XCircle className="w-3.5 h-3.5" /> 忽略
              </button>
              {row.sourceResultId && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/research-triage?resultId=${row.sourceResultId}`)
                  }
                  title="查看源测评结果"
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function priorityLabel(p: string): string {
  return { low: '低', normal: '一般', high: '高', urgent: '紧急' }[p] ?? p;
}

function priorityClass(p: string): string {
  return (
    {
      low: 'bg-slate-100 text-slate-600',
      normal: 'bg-slate-100 text-slate-700',
      high: 'bg-amber-100 text-amber-700',
      urgent: 'bg-red-100 text-red-700',
    }[p] ?? 'bg-slate-100 text-slate-600'
  );
}

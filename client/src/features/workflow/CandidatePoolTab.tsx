/**
 * 协作中心 / 待处理候选 — tab 页。
 *
 * 显示由规则引擎产生的、等待人工处理的候选:
 *   - 个案候选 → 咨询师决定是否建个案
 *   - 团辅候选 → 心理老师决定如何组团
 *   - 危机候选 → 咨询师主导多步危机处置工作流
 *   - 课程候选 → 推送课程前的备选
 *
 * 用户可以"接受"(去对应业务页面创建实体)或"忽略"(记录理由)。
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, XCircle, AlertTriangle, UserPlus, Users, Flame, BookOpen,
  ChevronRight,
} from 'lucide-react';
import {
  useCandidatePool,
  useAcceptCandidate,
  useDismissCandidate,
} from '../../api/useWorkflow';
import { useToast } from '../../shared/components';
import {
  CANDIDATE_KIND_LABELS,
  type CandidateEntry,
  type CandidateKind,
  type CandidatePriority,
} from '@psynote/shared';
import { NoAutoContactDisclaimer } from './NoAutoContactDisclaimer';

const KIND_ICONS: Record<CandidateKind, React.ComponentType<{ className?: string }>> = {
  episode_candidate: UserPlus,
  group_candidate: Users,
  crisis_candidate: Flame,
  course_candidate: BookOpen,
};

const KIND_COLOR: Record<CandidateKind, { bg: string; icon: string; chip: string }> = {
  episode_candidate: { bg: 'bg-blue-50',   icon: 'text-blue-600',   chip: 'bg-blue-100 text-blue-700' },
  group_candidate:   { bg: 'bg-purple-50', icon: 'text-purple-600', chip: 'bg-purple-100 text-purple-700' },
  crisis_candidate:  { bg: 'bg-red-50',    icon: 'text-red-600',    chip: 'bg-red-100 text-red-700' },
  course_candidate:  { bg: 'bg-teal-50',   icon: 'text-teal-600',   chip: 'bg-teal-100 text-teal-700' },
};

const PRIORITY_STYLE: Record<CandidatePriority, string> = {
  low:    'bg-slate-100 text-slate-600',
  normal: 'bg-slate-100 text-slate-700',
  high:   'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
};

const PRIORITY_LABEL: Record<CandidatePriority, string> = {
  low: '低', normal: '一般', high: '高', urgent: '紧急',
};

const KIND_TABS: { value: CandidateKind | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'crisis_candidate',  label: CANDIDATE_KIND_LABELS.crisis_candidate },
  { value: 'episode_candidate', label: CANDIDATE_KIND_LABELS.episode_candidate },
  { value: 'group_candidate',   label: CANDIDATE_KIND_LABELS.group_candidate },
  { value: 'course_candidate',  label: CANDIDATE_KIND_LABELS.course_candidate },
];

export function CandidatePoolTab() {
  const [tab, setTab] = useState<CandidateKind | 'all'>('all');
  const { data: candidates = [], isLoading } = useCandidatePool({
    kind: tab === 'all' ? undefined : tab,
    status: 'pending',
  });

  const counts = countsByKind(candidates);

  return (
    <div className="space-y-4">
      <NoAutoContactDisclaimer />

      {/* Kind tabs */}
      <div className="flex flex-wrap items-center gap-1 bg-slate-100 rounded-xl p-1">
        {KIND_TABS.map((t) => {
          const active = tab === t.value;
          const count = t.value === 'all'
            ? candidates.length
            : counts[t.value as CandidateKind] || 0;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  active ? 'bg-slate-200 text-slate-700' : 'bg-slate-300 text-slate-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-400 py-12 text-center">加载候选…</div>
      ) : candidates.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl p-10 text-center">
          <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">
            暂无待处理候选
          </p>
          <p className="text-xs text-slate-400 mt-1">
            候选由「自动化规则」生成,当来访者完成测评并符合规则条件时会出现在这里
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => <CandidateRow key={c.id} entry={c} />)}
        </div>
      )}
    </div>
  );
}

function countsByKind(entries: CandidateEntry[]): Record<CandidateKind, number> {
  return entries.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {} as Record<CandidateKind, number>);
}

function CandidateRow({ entry }: { entry: CandidateEntry }) {
  const navigate = useNavigate();
  const accept = useAcceptCandidate();
  const dismiss = useDismissCandidate();
  const { toast } = useToast();

  const Icon = KIND_ICONS[entry.kind];
  const color = KIND_COLOR[entry.kind];

  const handleAccept = async () => {
    // For each kind, route the user to the appropriate workbench to complete
    // the action. We mark the candidate as accepted so it doesn't pile up —
    // it's OK if the user bails out; they can revive the candidate later.
    try {
      const result = await accept.mutateAsync({ id: entry.id }) as (typeof entry & {
        episodeId?: string;
        crisisCaseId?: string;
      });

      // Route by kind
      if (entry.kind === 'crisis_candidate') {
        // Crisis: server atomically created an episode + crisis_case. Jump
        // directly to EpisodeDetail in crisis mode so the counselor lands on
        // the checklist.
        if (result?.episodeId) {
          toast('已开启危机处置案件', 'success');
          navigate(`/episodes/${result.episodeId}?mode=crisis`);
        } else {
          toast('已标记为接受,但未生成 episode — 请联系管理员', 'error');
        }
      } else if (entry.kind === 'episode_candidate') {
        toast('已标记为接受。请前往协作中心完成派单。', 'success');
        navigate('/collaboration?tab=assignments');
      } else if (entry.kind === 'group_candidate') {
        toast('已标记为接受。请在团辅工作台组人。', 'success');
        navigate('/delivery?type=group');
      } else if (entry.kind === 'course_candidate') {
        toast('已标记为接受。请在课程工作台安排推送。', 'success');
        navigate('/delivery?type=course');
      }
    } catch (err: any) {
      toast(err?.message || '操作失败', 'error');
    }
  };

  const handleDismiss = async () => {
    const reason = prompt('忽略原因(可选):') || undefined;
    try {
      await dismiss.mutateAsync({ id: entry.id, reason });
      toast('已忽略', 'success');
    } catch (err: any) {
      toast(err?.message || '操作失败', 'error');
    }
  };

  const isCrisis = entry.kind === 'crisis_candidate';

  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-4 ${isCrisis ? 'ring-2 ring-red-200' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color.bg}`}>
          <Icon className={`w-5 h-5 ${color.icon}`} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${color.chip}`}>
              {CANDIDATE_KIND_LABELS[entry.kind]}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_STYLE[entry.priority]}`}>
              {PRIORITY_LABEL[entry.priority]}
            </span>
            <span className="text-sm font-semibold text-slate-900">
              {entry.clientName || '未知来访者'}
            </span>
            {entry.clientEmail && (
              <span className="text-xs text-slate-400">{entry.clientEmail}</span>
            )}
          </div>

          {/* Suggestion */}
          <div className="text-sm text-slate-700">{entry.suggestion}</div>
          {entry.reason && (
            <div className="text-xs text-slate-500 mt-1">{entry.reason}</div>
          )}

          {/* Crisis-specific guidance */}
          {isCrisis && (
            <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded text-xs text-red-800 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium mb-0.5">危机处置流程(人工主导)</div>
                <div>① 24h 内二次访谈 · ② 咨询师判断真危机/误报 · ③ 如需联系家长,先核实授权并手动发出</div>
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
            <span>{new Date(entry.createdAt).toLocaleString('zh-CN')}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1">
          <button
            onClick={handleAccept}
            disabled={accept.isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            接受
            <ChevronRight className="w-3 h-3" />
          </button>
          <button
            onClick={handleDismiss}
            disabled={dismiss.isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />
            忽略
          </button>
        </div>
      </div>
    </div>
  );
}

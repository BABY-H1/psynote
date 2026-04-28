import React, { useState, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  useEpisode, useCloseEpisode, useReopenEpisode,
  useSessionNotes,
} from '../../../api/useCounseling';
import { useTreatmentPlans } from '../../../api/useTreatmentPlan';
import { useClientProfile } from '../../../api/useClientProfile';
import { useResults } from '../../../api/useAssessments';
import { useCrisisCaseByEpisode } from '../../../api/useCrisisCase';

import { WorkspaceLayout } from '../components/WorkspaceLayout';
import { ChatWorkspace, type WorkMode, type ChatWorkspaceHandle } from '../components/ChatWorkspace';
import { OutputPanel } from '../components/OutputPanel';
import { LeftPanel } from '../components/LeftPanel';

import {
  PageLoading,
  useToast,
  ServiceDetailLayout,
} from '../../../shared/components';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { SessionNote, ServiceStatus } from '@psynote/shared';

/**
 * Phase 4d — EpisodeDetail wrapped in `<ServiceDetailLayout variant="workspace">`.
 *
 * MINIMUM-DISTURBANCE migration:
 *  - The 3-column workspace (LeftPanel / ChatWorkspace / OutputPanel) is
 *    rendered EXACTLY as before. Zero modifications to those component calls.
 *  - The previous inline top banner is removed; the back button, title, status
 *    pill, and action buttons (结案 / 重新开启) are all moved into the
 *    `ServiceDetailLayout` chrome.
 *  - Status text/colors preserved via `statusText`/`statusClassName` overrides
 *    so counseling-specific labels (已结案, etc.) remain the same.
 *  - Hooks order is preserved: all `useMemo` calls run before the early return.
 */

const STATUS_TONE: Record<string, { text: string; cls: string }> = {
  active: { text: '进行中', cls: 'bg-blue-50 text-blue-700' },
  paused: { text: '暂停', cls: 'bg-yellow-50 text-yellow-700' },
  closed: { text: '已结案', cls: 'bg-slate-100 text-slate-500' },
  archived: { text: '已归档', cls: 'bg-slate-100 text-slate-400' },
};

function mapEpisodeStatus(s: string): ServiceStatus {
  switch (s) {
    case 'active':
      return 'ongoing';
    case 'paused':
      return 'paused';
    case 'closed':
      return 'closed';
    case 'archived':
      return 'archived';
    default:
      return 'draft';
  }
}

export function EpisodeDetail() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: episode } = useEpisode(episodeId);
  const { data: plans } = useTreatmentPlans(episodeId);
  const { data: sessionNotes } = useSessionNotes({ careEpisodeId: episodeId });
  const { data: profile } = useClientProfile(episode?.clientId);
  const { data: assessmentResults } = useResults({ userId: episode?.clientId });
  const { data: crisisCase } = useCrisisCaseByEpisode(episodeId);
  const closeEpisode = useCloseEpisode();
  const reopenEpisode = useReopenEpisode();
  const { toast } = useToast();

  const isCrisisEpisode = episode?.interventionType === 'crisis' && !!crisisCase;
  const urlMode = searchParams.get('mode') as WorkMode | null;
  const initialMode: WorkMode =
    urlMode === 'crisis' && isCrisisEpisode ? 'crisis'
    : isCrisisEpisode ? 'crisis'
    : 'note';

  const [noteFields, setNoteFields] = useState<Record<string, string>>({});
  const [noteFormat, setNoteFormat] = useState('soap');
  const [planSuggestion, setPlanSuggestion] = useState<any>(null);
  const [currentMode, setCurrentMode] = useState<WorkMode>(initialMode);

  // If the crisis case loads after first render (e.g. async), snap into
  // crisis mode automatically for a crisis episode. Also honor an explicit
  // `?mode=crisis` URL so the Accept-candidate deep-link lands on the
  // checklist even though `crisisCase` arrives after first paint.
  React.useEffect(() => {
    if (isCrisisEpisode && currentMode === 'note' && (urlMode === 'crisis' || !urlMode)) {
      setCurrentMode('crisis');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCrisisEpisode]);
  const [viewingNote, setViewingNote] = useState<SessionNote | null>(null);
  const [viewingResult, setViewingResult] = useState<any>(null);
  const [viewingConversation, setViewingConversation] = useState<any>(null);
  /*
   * Phase I: chatWsRef 让 EpisodeDetail 能 imperatively 调 ChatWorkspace 的
   * loadConversation (Issue 2 续写) + bindCurrentNoteToSession (Issue 1 关联).
   */
  const chatWsRef = useRef<ChatWorkspaceHandle>(null);

  // Build rich AI context from all available data (hooks must be before early return)
  const clientContext = useMemo(() => {
    if (!profile && !episode) return undefined;
    const age = profile?.dateOfBirth
      ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / 31557600000)
      : undefined;
    return {
      name: episode?.client?.name,
      age,
      gender: profile?.gender,
      occupation: profile?.occupation,
      education: profile?.education,
      presentingIssues: (profile?.presentingIssues as string[]) || [],
      medicalHistory: profile?.medicalHistory,
      familyBackground: profile?.familyBackground,
    };
  }, [profile, episode]);

  // All session notes in chronological order (oldest first)
  const sessionHistorySummary = useMemo(() => {
    if (!sessionNotes?.length) return undefined;
    return [...sessionNotes]
      .reverse()
      .map((n: any, i: number) => {
        const date = n.sessionDate ? new Date(n.sessionDate).toLocaleDateString('zh-CN') : '';
        return `第${i + 1}次(${date}): ${n.summary || '无摘要'}`;
      })
      .join('\n');
  }, [sessionNotes]);

  const assessmentSummary = useMemo(() => {
    if (!assessmentResults?.length) return undefined;
    return assessmentResults
      .slice(0, 3)
      .map((r: any) => {
        const date = r.completedAt ? new Date(r.completedAt).toLocaleDateString('zh-CN') : '';
        const scaleName = r.scaleTitles?.[0] || r.assessmentTitle || '量表';
        const interps = (r.interpretations || []).map((d: any) => `${d.dimension}: ${d.score}分(${d.label})`).join(', ');
        return `${scaleName}(${date}): 总分${r.totalScore}${interps ? `, ${interps}` : ''}`;
      })
      .join('\n');
  }, [assessmentResults]);

  if (!episode) return <PageLoading />;

  const activePlan = plans?.find((p) => p.status === 'active');
  const goals = (activePlan?.goals as any[]) || [];
  const goalProgress = goals.length > 0
    ? { total: goals.length, achieved: goals.filter((g: any) => g.status === 'achieved').length }
    : undefined;

  const lastNote = sessionNotes?.[0];
  const presentingIssues = (profile?.presentingIssues as string[]) || [];

  const tone = STATUS_TONE[episode.status] || STATUS_TONE.active;

  return (
    <ServiceDetailLayout
      variant="workspace"
      // h-full flex flex-col 让 ServiceDetailLayout 占满 main 可用高度,
      // header flex-shrink-0 + body flex-1 min-h-0 锁住三栏 viewport.
      // 之前 calc(100vh-5rem) 跟 main 实际高度有 ~30px 偏差导致整页滚动.
      className="h-full flex flex-col"
      title={episode.client?.name || '未知来访者'}
      status={mapEpisodeStatus(episode.status)}
      statusText={tone.text}
      statusClassName={tone.cls}
      metaLine={
        isCrisisEpisode ? (
          <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-xs">
            <AlertTriangle className="w-3 h-3" />
            危机处置案件 · 在右侧清单按步骤操作
          </span>
        ) : episode.chiefComplaint ? (
          <span>{episode.chiefComplaint}</span>
        ) : undefined
      }
      onBack={() => navigate('/episodes')}
      actions={
        <>
          {episode.status === 'active' && (
            <button
              onClick={async () => {
                if (confirm('确定结案？此操作可以撤销。')) {
                  await closeEpisode.mutateAsync({ episodeId: episode.id });
                  toast('已结案', 'success');
                }
              }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              结案
            </button>
          )}
          {episode.status === 'closed' && (
            <button
              onClick={async () => { await reopenEpisode.mutateAsync(episode.id); toast('已重新开启', 'success'); }}
              disabled={reopenEpisode.isPending}
              className="px-3 py-2 border border-brand-200 rounded-lg text-sm text-brand-600 hover:bg-brand-50 flex items-center gap-1"
            >
              <RotateCcw className="w-4 h-4" /> 重新开启
            </button>
          )}
        </>
      }
    >
      <WorkspaceLayout
        left={
          <LeftPanel
            episodeId={episode.id}
            clientId={episode.clientId}
            onSelectNote={(note) => { setViewingNote(note); setViewingResult(null); setViewingConversation(null); }}
            onSelectResult={(result) => { setViewingResult(result); setViewingNote(null); setViewingConversation(null); }}
            onSelectConversation={(conv) => {
              /*
               * Phase I Issue 2: 续写交互 — 默认行为从打开只读 viewer 改成
               * 把对话载入 ChatWorkspace, 用户可继续输入. 关闭其他 viewer
               * (note/result), 但不打开 conversation viewer 了.
               * 保留 ConversationViewer 在 OutputPanel 里用作 viewingConversation
               * 渲染兜底 (例如未来已结案 episode 的只读访问), 但默认不触发.
               */
              setViewingNote(null);
              setViewingResult(null);
              setViewingConversation(null);
              chatWsRef.current?.loadConversation(conv.mode, conv.messages || [], conv.id);
            }}
          />
        }
        center={
          <ChatWorkspace
            ref={chatWsRef}
            episodeId={episode.id}
            clientId={episode.clientId}
            chiefComplaint={episode.chiefComplaint}
            activePlan={activePlan}
            clientContext={clientContext}
            sessionHistorySummary={sessionHistorySummary}
            assessmentSummary={assessmentSummary}
            lastNoteSummary={lastNote?.summary}
            isCrisisEpisode={isCrisisEpisode}
            initialMode={initialMode}
            onModeChange={setCurrentMode}
            onNoteFormatChange={(format) => { setNoteFormat(format); setNoteFields({}); }}
            onNoteFieldsUpdate={(fields, format) => {
              setNoteFields((prev) => ({ ...prev, ...fields }));
              setNoteFormat(format);
              setCurrentMode('note');
            }}
            onPlanSuggestion={(data) => {
              setPlanSuggestion(data);
              setCurrentMode('plan');
            }}
          />
        }
        right={
          <OutputPanel
            mode={currentMode}
            episodeId={episode.id}
            clientId={episode.clientId}
            episode={episode}
            noteFields={noteFields}
            noteFormat={noteFormat}
            onNoteSaved={(savedNote) => {
              /*
               * Phase I Issue 1: 把当前 mode='note' 的 ai_conversation 关联
               * 到刚保存的 sessionNote. ChatWorkspace 内部会:
               *   1. PATCH /ai-conversations/{noteConvId} { sessionNoteId }
               *   2. 清空本地 noteConvId 和 messages.note (下次写新笔记开新对话)
               * 关联后 LeftPanel 把这条 conversation 显示在"会谈记录"区
               * 该 sessionNote 的子条目, 而不是"AI 对话"区.
               */
              chatWsRef.current?.bindCurrentNoteToSession(savedNote.id);
              // sessionNote 列表也清空 viewingNote, 防止用户保存后还停在"编辑"态
              setViewingNote(null);
              // 清 noteFields, 让下次写新笔记从空表单开始
              setNoteFields({});
            }}
            onNoteFieldChange={(key, val) => setNoteFields((prev) => ({ ...prev, [key]: val }))}
            onNoteFormatChange={(format) => { setNoteFormat(format); setNoteFields({}); }}
            planSuggestion={planSuggestion}
            activePlan={activePlan}
            plans={plans || []}
            goalProgress={goalProgress}
            lastNoteSummary={lastNote?.summary || undefined}
            lastNoteDate={lastNote ? lastNote.sessionDate : undefined}
            presentingIssues={presentingIssues}
            viewingNote={viewingNote}
            onCloseNote={() => setViewingNote(null)}
            viewingResult={viewingResult}
            onCloseResult={() => setViewingResult(null)}
            viewingConversation={viewingConversation}
            onCloseConversation={() => setViewingConversation(null)}
            crisisCase={crisisCase}
            clientName={episode.client?.name}
          />
        }
      />
    </ServiceDetailLayout>
  );
}

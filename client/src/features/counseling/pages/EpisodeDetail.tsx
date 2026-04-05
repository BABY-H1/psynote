import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useEpisode, useCloseEpisode, useReopenEpisode,
  useSessionNotes,
} from '../../../api/useCounseling';
import { useTreatmentPlans } from '../../../api/useTreatmentPlan';
import { useClientProfile } from '../../../api/useClientProfile';
import { useResults } from '../../../api/useAssessments';

import { WorkspaceLayout } from '../components/WorkspaceLayout';
import { ChatWorkspace, type WorkMode } from '../components/ChatWorkspace';
import { OutputPanel } from '../components/OutputPanel';
import { LeftPanel } from '../components/LeftPanel';

import { PageLoading, useToast } from '../../../shared/components';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import type { SessionNote } from '@psynote/shared';

const statusLabels: Record<string, string> = {
  active: '进行中', paused: '暂停', closed: '已结案', archived: '已归档',
};

export function EpisodeDetail() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();
  const { data: episode } = useEpisode(episodeId);
  const { data: plans } = useTreatmentPlans(episodeId);
  const { data: sessionNotes } = useSessionNotes({ careEpisodeId: episodeId });
  const { data: profile } = useClientProfile(episode?.clientId);
  const { data: assessmentResults } = useResults({ userId: episode?.clientId });
  const closeEpisode = useCloseEpisode();
  const reopenEpisode = useReopenEpisode();
  const { toast } = useToast();

  const [noteFields, setNoteFields] = useState<Record<string, string>>({});
  const [noteFormat, setNoteFormat] = useState('soap');
  const [planSuggestion, setPlanSuggestion] = useState<any>(null);
  const [currentMode, setCurrentMode] = useState<WorkMode>('note');
  const [viewingNote, setViewingNote] = useState<SessionNote | null>(null);
  const [viewingResult, setViewingResult] = useState<any>(null);
  const [viewingConversation, setViewingConversation] = useState<any>(null);

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

  return (
    <>
      {/* Top banner */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/episodes')} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-slate-900">{episode.client?.name || '未知'}</span>
          <span className="text-xs text-slate-400">{statusLabels[episode.status]}</span>
          {episode.chiefComplaint && (
            <span className="text-xs text-slate-500 hidden md:inline">— {episode.chiefComplaint}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {episode.status === 'active' && (
            <button
              onClick={async () => {
                if (confirm('确定结案？此操作可以撤销。')) {
                  await closeEpisode.mutateAsync({ episodeId: episode.id });
                  toast('已结案', 'success');
                }
              }}
              className="px-3 py-1 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50"
            >
              结案
            </button>
          )}
          {episode.status === 'closed' && (
            <button
              onClick={async () => { await reopenEpisode.mutateAsync(episode.id); toast('已重新开启', 'success'); }}
              disabled={reopenEpisode.isPending}
              className="px-3 py-1 border border-brand-200 rounded text-xs text-brand-600 hover:bg-brand-50 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> 重新开启
            </button>
          )}
        </div>
      </div>

      <WorkspaceLayout
        left={
          <LeftPanel
            episodeId={episode.id}
            clientId={episode.clientId}
            onSelectNote={(note) => { setViewingNote(note); setViewingResult(null); setViewingConversation(null); }}
            onSelectResult={(result) => { setViewingResult(result); setViewingNote(null); setViewingConversation(null); }}
            onSelectConversation={(conv) => { setViewingConversation(conv); setViewingNote(null); setViewingResult(null); }}
          />
        }
        center={
          <ChatWorkspace
            episodeId={episode.id}
            clientId={episode.clientId}
            chiefComplaint={episode.chiefComplaint}
            activePlan={activePlan}
            clientContext={clientContext}
            sessionHistorySummary={sessionHistorySummary}
            assessmentSummary={assessmentSummary}
            lastNoteSummary={lastNote?.summary}
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
          />
        }
      />
    </>
  );
}

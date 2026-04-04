import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useEpisode, useCloseEpisode, useReopenEpisode,
  useSessionNotes,
} from '../../../api/useCounseling';
import { useTreatmentPlans } from '../../../api/useTreatmentPlan';
import { useClientProfile } from '../../../api/useClientProfile';

import { WorkspaceLayout } from '../components/WorkspaceLayout';
import { ChatWorkspace, type WorkMode } from '../components/ChatWorkspace';
import { OutputPanel } from '../components/OutputPanel';
import { LeftPanel } from '../components/LeftPanel';
import { NoteViewer } from '../components/NoteViewer';

import { PageLoading, useToast } from '../../../shared/components';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import type { SessionNote } from '@psynote/shared';

const statusLabels: Record<string, string> = {
  active: '进行中', paused: '暂停', closed: '已结案', archived: '已归档',
};

type CenterView =
  | { type: 'chat' }
  | { type: 'viewNote'; note: SessionNote }
  | { type: 'editNote'; note: SessionNote };

export function EpisodeDetail() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();
  const { data: episode } = useEpisode(episodeId);
  const { data: plans } = useTreatmentPlans(episodeId);
  const { data: sessionNotes } = useSessionNotes({ careEpisodeId: episodeId });
  const { data: profile } = useClientProfile(episode?.clientId);
  const closeEpisode = useCloseEpisode();
  const reopenEpisode = useReopenEpisode();
  const { toast } = useToast();

  const [noteFields, setNoteFields] = useState<Record<string, string>>({});
  const [noteFormat, setNoteFormat] = useState('soap');
  const [planSuggestion, setPlanSuggestion] = useState<any>(null);
  const [currentMode, setCurrentMode] = useState<WorkMode>('note');
  const [centerView, setCenterView] = useState<CenterView>({ type: 'chat' });

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
            onSelectNote={(note) => setCenterView({ type: 'viewNote', note })}
          />
        }
        center={
          centerView.type === 'chat' ? (
            <ChatWorkspace
              episodeId={episode.id}
              clientId={episode.clientId}
              chiefComplaint={episode.chiefComplaint}
              currentRisk={episode.currentRisk}
              activePlan={activePlan}
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
          ) : centerView.type === 'viewNote' || centerView.type === 'editNote' ? (
            <NoteViewer
              note={centerView.note}
              editing={centerView.type === 'editNote'}
              onEdit={() => setCenterView({ type: 'editNote', note: centerView.note })}
              onClose={() => setCenterView({ type: 'chat' })}
            />
          ) : null
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
            planSuggestion={planSuggestion}
            activePlan={activePlan}
            plans={plans || []}
            goalProgress={goalProgress}
            lastNoteSummary={lastNote?.summary || undefined}
            lastNoteDate={lastNote ? lastNote.sessionDate : undefined}
            presentingIssues={presentingIssues}
          />
        }
      />
    </>
  );
}

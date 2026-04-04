import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useEpisode, useEpisodes, useCloseEpisode, useReopenEpisode,
  useSessionNotes,
  useReferrals, useUpdateReferral,
  useFollowUpPlans, useFollowUpReviews,
} from '../../../api/useCounseling';
import { useResults } from '../../../api/useAssessments';
import { useClientProfile } from '../../../api/useClientProfile';
import { useTreatmentPlans } from '../../../api/useTreatmentPlan';
import { useConsentDocuments } from '../../../api/useConsent';
import { useComplianceReviews } from '../../../api/useCompliance';

import { WorkspaceLayout } from '../components/WorkspaceLayout';
import { ChatWorkspace, type WorkMode } from '../components/ChatWorkspace';
import { OutputPanel } from '../components/OutputPanel';
import { ReferralForm } from '../components/ReferralForm';
import { ReferralCard } from '../components/ReferralCard';
import { FollowUpPlanForm } from '../components/FollowUpPlanForm';
import { FollowUpCard } from '../components/FollowUpCard';
import { SendConsentForm } from '../components/SendConsentForm';
import { ClientProfilePanel } from '../components/ClientProfilePanel';

import { PageLoading, useToast } from '../../../shared/components';
import {
  ArrowLeft, FileText, BarChart3, ChevronDown, ChevronUp,
  ArrowRightLeft, ClipboardList, FileCheck, User, FolderArchive, RotateCcw,
} from 'lucide-react';

const statusLabels: Record<string, string> = {
  active: '进行中', paused: '暂停', closed: '已结案', archived: '已归档',
};

export function EpisodeDetail() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();
  const { data: episode } = useEpisode(episodeId);
  const { data: plans } = useTreatmentPlans(episodeId);
  const closeEpisode = useCloseEpisode();
  const reopenEpisode = useReopenEpisode();
  const { toast } = useToast();

  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [noteFields, setNoteFields] = useState<Record<string, string>>({});
  const [noteFormat, setNoteFormat] = useState('soap');
  const [planSuggestion, setPlanSuggestion] = useState<any>(null);
  const [currentMode, setCurrentMode] = useState<WorkMode>('note');

  if (!episode) return <PageLoading />;

  const activePlan = plans?.find((p) => p.status === 'active');
  const goals = (activePlan?.goals as any[]) || [];
  const goalProgress = goals.length > 0
    ? { total: goals.length, achieved: goals.filter((g: any) => g.status === 'achieved').length }
    : undefined;

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
              onClick={async () => {
                await reopenEpisode.mutateAsync(episode.id);
                toast('已重新开启', 'success');
              }}
              disabled={reopenEpisode.isPending}
              className="px-3 py-1 border border-brand-200 rounded text-xs text-brand-600 hover:bg-brand-50 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              重新开启
            </button>
          )}
        </div>
      </div>

      <WorkspaceLayout
        left={
          <LeftPanel
            episodeId={episode.id}
            clientId={episode.clientId}
            onOpenHistory={() => setShowHistoryDrawer(true)}
          />
        }
        center={
          <ChatWorkspace
            episodeId={episode.id}
            clientId={episode.clientId}
            chiefComplaint={episode.chiefComplaint}
            currentRisk={episode.currentRisk}
            activePlan={activePlan}
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
            planSuggestion={planSuggestion}
            activePlan={activePlan}
            plans={plans || []}
            goalProgress={goalProgress}
          />
        }
      />

      {/* History drawer */}
      {showHistoryDrawer && (
        <HistoryDrawer
          clientId={episode.clientId}
          clientName={episode.client?.name || '未知'}
          currentEpisodeId={episode.id}
          onClose={() => setShowHistoryDrawer(false)}
        />
      )}
    </>
  );
}

// ─── History Drawer ─────────────────────────────────────────────

function HistoryDrawer({ clientId, clientName, currentEpisodeId, onClose }: {
  clientId: string; clientName: string; currentEpisodeId: string; onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data: allEpisodes } = useEpisodes({ clientId });
  const pastEpisodes = (allEpisodes || []).filter((ep) => ep.id !== currentEpisodeId);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[500px] max-w-[90vw] bg-white shadow-2xl overflow-y-auto ml-0">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-10">
          <span className="text-sm font-semibold text-slate-900">{clientName} — 历史档案</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xs">关闭</button>
        </div>
        <div className="p-4">
          {pastEpisodes.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400">暂无历史个案</div>
          ) : (
            <div className="space-y-3">
              {pastEpisodes.map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => { navigate(`/episodes/${ep.id}`); onClose(); }}
                  className="w-full text-left bg-slate-50 rounded-lg p-3 hover:bg-slate-100 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{ep.chiefComplaint || '未填写主诉'}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      ep.status === 'closed' ? 'bg-slate-200 text-slate-500' : 'bg-blue-50 text-blue-700'
                    }`}>{statusLabels[ep.status]}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {new Date(ep.openedAt || ep.createdAt).toLocaleDateString('zh-CN')}
                    {ep.closedAt && ` — ${new Date(ep.closedAt).toLocaleDateString('zh-CN')}`}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Full profile section */}
          <div className="mt-6 pt-4 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">完整档案</h3>
            <ClientProfilePanel clientId={clientId} clientName={clientName} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Left Panel ─────────────────────────────────────────────────

type BottomTab = 'referral' | 'followup' | 'consent';

function LeftPanel({ episodeId, clientId, onOpenHistory }: {
  episodeId: string; clientId: string; onOpenHistory: () => void;
}) {
  const { data: profile } = useClientProfile(clientId);
  const { data: sessionNotes } = useSessionNotes({ careEpisodeId: episodeId });
  const { data: assessmentResults } = useResults({ userId: clientId });
  const { data: referrals } = useReferrals(episodeId);
  const updateReferral = useUpdateReferral();
  const { data: followUpPlans } = useFollowUpPlans(episodeId);
  const { data: followUpReviews } = useFollowUpReviews(episodeId);
  const { data: consentDocs } = useConsentDocuments({ clientId, careEpisodeId: episodeId });
  const { toast } = useToast();
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<BottomTab | null>(null);
  const [showReferralForm, setShowReferralForm] = useState(false);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [showConsentForm, setShowConsentForm] = useState(false);

  let age: string | undefined;
  if (profile?.dateOfBirth) {
    const y = Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 86400000));
    age = `${y}岁`;
  }
  const genderLabels: Record<string, string> = { male: '男', female: '女', other: '其他' };

  const pendingReferrals = referrals?.filter((r) => r.status === 'pending').length || 0;
  const activePlans = followUpPlans?.filter((p) => p.status === 'active').length || 0;
  const pendingConsents = (consentDocs || []).filter((d) => d.status === 'pending').length;

  return (
    <div className="flex flex-col h-full">
      {/* Client basic info */}
      <div className="p-3 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {profile?.gender && <span>{genderLabels[profile.gender] || profile.gender}</span>}
          {age && <span>{age}</span>}
          {profile?.phone && <span>{profile.phone}</span>}
          {profile?.occupation && <span>· {profile.occupation}</span>}
        </div>
        {(!profile || (!profile.phone && !profile.gender)) && (
          <div className="text-xs text-slate-400">基本信息未填写</div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Session notes */}
        <SectionHeader icon={<FileText className="w-3.5 h-3.5" />} title="会谈记录" count={sessionNotes?.length} />
        <div className="px-3 pb-2 space-y-1">
          {(!sessionNotes || sessionNotes.length === 0) ? (
            <div className="text-xs text-slate-400 py-2">暂无会谈记录</div>
          ) : (
            sessionNotes.map((note, i) => (
              <div key={note.id}>
                <button
                  onClick={() => setExpandedNote(expandedNote === note.id ? null : note.id)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition ${
                    expandedNote === note.id ? 'bg-emerald-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 text-xs font-medium">
                    {sessionNotes.length - i}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-700 truncate">{note.summary || `${note.noteFormat?.toUpperCase() || 'SOAP'} 记录`}</div>
                    <div className="text-slate-400">{note.sessionDate}</div>
                  </div>
                  {expandedNote === note.id ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
                </button>
                {expandedNote === note.id && (
                  <div className="ml-7 mt-1 mb-2 p-2 bg-slate-50 rounded-lg text-xs space-y-1.5">
                    {note.subjective && <div><span className="font-medium text-slate-500">S:</span> <span className="text-slate-600">{note.subjective}</span></div>}
                    {note.objective && <div><span className="font-medium text-slate-500">O:</span> <span className="text-slate-600">{note.objective}</span></div>}
                    {note.assessment && <div><span className="font-medium text-slate-500">A:</span> <span className="text-slate-600">{note.assessment}</span></div>}
                    {note.plan && <div><span className="font-medium text-slate-500">P:</span> <span className="text-slate-600">{note.plan}</span></div>}
                    {note.fields && Object.keys(note.fields).length > 0 && Object.entries(note.fields).map(([k, v]) => (
                      <div key={k}><span className="font-medium text-slate-500">{k}:</span> <span className="text-slate-600">{v as string}</span></div>
                    ))}
                    {note.duration && <div className="text-slate-400">时长: {note.duration}分钟</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Assessment results */}
        <SectionHeader icon={<BarChart3 className="w-3.5 h-3.5" />} title="评估记录" count={assessmentResults?.length} />
        <div className="px-3 pb-2 space-y-1">
          {(!assessmentResults || assessmentResults.length === 0) ? (
            <div className="text-xs text-slate-400 py-2">暂无评估记录</div>
          ) : (
            assessmentResults.slice(0, 10).map((result: any) => (
              <div key={result.id}>
                <button
                  onClick={() => setExpandedResult(expandedResult === result.id ? null : result.id)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition ${
                    expandedResult === result.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-3 h-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-700 truncate">{result.totalScore != null ? `${result.totalScore}分` : '已完成'}</div>
                    <div className="text-slate-400">{new Date(result.createdAt).toLocaleDateString('zh-CN')}</div>
                  </div>
                  {expandedResult === result.id ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
                </button>
                {expandedResult === result.id && (
                  <div className="ml-7 mt-1 mb-2 p-2 bg-slate-50 rounded-lg text-xs space-y-1">
                    {result.totalScore != null && <div><span className="text-slate-500">总分:</span> <span className="text-slate-700 font-medium">{result.totalScore}</span></div>}
                    {result.dimensionScores && Object.entries(result.dimensionScores as Record<string, number>).map(([dim, score]) => (
                      <div key={dim}><span className="text-slate-500">{dim}:</span> <span className="text-slate-600">{score}</span></div>
                    ))}
                    {result.aiInterpretation && <div className="text-slate-500 mt-1 border-t border-slate-100 pt-1">{result.aiInterpretation}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bottom tabs: referral / follow-up / consent */}
      <div className="border-t border-slate-200">
        <div className="flex">
          {([
            { key: 'referral' as const, icon: <ArrowRightLeft className="w-3 h-3" />, label: '转介', badge: pendingReferrals },
            { key: 'followup' as const, icon: <ClipboardList className="w-3 h-3" />, label: '随访', badge: activePlans },
            { key: 'consent' as const, icon: <FileCheck className="w-3 h-3" />, label: '协议', badge: pendingConsents },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setBottomTab(bottomTab === tab.key ? null : tab.key)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition ${
                bottomTab === tab.key ? 'text-brand-700 bg-brand-50' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge > 0 && <span className="w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs">{tab.badge}</span>}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {bottomTab && (
          <div className="max-h-48 overflow-y-auto p-3 space-y-2 border-t border-slate-100">
            {bottomTab === 'referral' && (
              <>
                <button onClick={() => setShowReferralForm(!showReferralForm)} className="text-xs text-brand-600 hover:underline">
                  {showReferralForm ? '收起' : '+ 发起转介'}
                </button>
                {showReferralForm && <ReferralForm episodeId={episodeId} clientId={clientId} onDone={() => setShowReferralForm(false)} />}
                {(referrals || []).map((r) => (
                  <ReferralCard key={r.id} referral={r} isPending={updateReferral.isPending}
                    onStatusChange={async (status) => {
                      try { await updateReferral.mutateAsync({ referralId: r.id, status }); toast('已更新', 'success'); } catch { toast('失败', 'error'); }
                    }}
                  />
                ))}
                {(!referrals || referrals.length === 0) && !showReferralForm && <div className="text-xs text-slate-400 text-center">暂无</div>}
              </>
            )}
            {bottomTab === 'followup' && (
              <>
                <button onClick={() => setShowFollowUpForm(!showFollowUpForm)} className="text-xs text-brand-600 hover:underline">
                  {showFollowUpForm ? '收起' : '+ 新建随访计划'}
                </button>
                {showFollowUpForm && <FollowUpPlanForm episodeId={episodeId} onDone={() => setShowFollowUpForm(false)} />}
                {(followUpPlans || []).map((plan) => (
                  <FollowUpCard key={plan.id} plan={plan} reviews={followUpReviews || []} episodeId={episodeId} currentRisk="level_1" onReviewCreated={() => {}} />
                ))}
                {(!followUpPlans || followUpPlans.length === 0) && !showFollowUpForm && <div className="text-xs text-slate-400 text-center">暂无</div>}
              </>
            )}
            {bottomTab === 'consent' && (
              <>
                <button onClick={() => setShowConsentForm(!showConsentForm)} className="text-xs text-brand-600 hover:underline">
                  {showConsentForm ? '收起' : '+ 发送协议'}
                </button>
                {showConsentForm && <SendConsentForm clientId={clientId} careEpisodeId={episodeId} onDone={() => setShowConsentForm(false)} />}
                {(consentDocs || []).map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-slate-50">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${doc.status === 'signed' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className="text-slate-700 flex-1 truncate">{doc.title}</span>
                    <span className="text-slate-400">{doc.status === 'signed' ? '已签署' : '待签署'}</span>
                  </div>
                ))}
                {(!consentDocs || consentDocs.length === 0) && !showConsentForm && <div className="text-xs text-slate-400 text-center">暂无</div>}
              </>
            )}
          </div>
        )}
      </div>

      {/* History entry */}
      <div className="border-t border-slate-200 p-2">
        <button onClick={onOpenHistory} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-xs text-slate-600 transition">
          <FolderArchive className="w-3.5 h-3.5" />
          历史档案
        </button>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
      <span className="text-slate-400">{icon}</span>
      <span className="text-xs font-medium text-slate-500">{title}</span>
      {count != null && count > 0 && <span className="text-xs text-slate-400">({count})</span>}
    </div>
  );
}

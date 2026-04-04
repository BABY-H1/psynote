import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useEpisode, useEpisodes, useCloseEpisode, useReopenEpisode,
  useSessionNotes, useUpdateSessionNote,
  useReferrals, useUpdateReferral,
  useFollowUpPlans, useFollowUpReviews,
} from '../../../api/useCounseling';
import { useResults } from '../../../api/useAssessments';
import { useClientProfile } from '../../../api/useClientProfile';
import { useTreatmentPlans } from '../../../api/useTreatmentPlan';
import { useConsentDocuments } from '../../../api/useConsent';

import { WorkspaceLayout } from '../components/WorkspaceLayout';
import { ChatWorkspace, type WorkMode } from '../components/ChatWorkspace';
import { OutputPanel } from '../components/OutputPanel';
import { ReferralForm } from '../components/ReferralForm';
import { ReferralCard } from '../components/ReferralCard';
import { FollowUpPlanForm } from '../components/FollowUpPlanForm';
import { FollowUpCard } from '../components/FollowUpCard';
import { SendConsentForm } from '../components/SendConsentForm';

import { PageLoading, useToast } from '../../../shared/components';
import {
  ArrowLeft, FileText, BarChart3, ChevronDown, ChevronUp,
  ArrowRightLeft, ClipboardList, FileCheck, RotateCcw, Download,
  X, Save, Edit3,
} from 'lucide-react';
import type { SessionNote } from '@psynote/shared';

const statusLabels: Record<string, string> = {
  active: '进行中', paused: '暂停', closed: '已结案', archived: '已归档',
};

// ─── Center view types ──────────────────────────────────────────

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

// ─── Note Viewer / Editor (center panel) ────────────────────────

function NoteViewer({ note, editing, onEdit, onClose }: {
  note: SessionNote; editing: boolean; onEdit: () => void; onClose: () => void;
}) {
  const updateNote = useUpdateSessionNote();
  const { toast } = useToast();
  const [fields, setFields] = useState<Record<string, string>>(() => {
    if (note.noteFormat === 'soap' || !note.noteFormat) {
      return {
        subjective: note.subjective || '',
        objective: note.objective || '',
        assessment: note.assessment || '',
        plan: note.plan || '',
      };
    }
    return (note.fields as Record<string, string>) || {};
  });

  const handleSave = async () => {
    try {
      const data: any = {};
      if (note.noteFormat === 'soap' || !note.noteFormat) {
        data.subjective = fields.subjective;
        data.objective = fields.objective;
        data.assessment = fields.assessment;
        data.plan = fields.plan;
      } else {
        data.fields = fields;
      }
      await updateNote.mutateAsync({ noteId: note.id, ...data });
      toast('笔记已更新', 'success');
      onClose();
    } catch {
      toast('更新失败', 'error');
    }
  };

  const formatLabel = (note.noteFormat || 'soap').toUpperCase();
  const fieldDefs = note.noteFormat === 'dap'
    ? [{ key: 'data', label: 'D - 资料' }, { key: 'assessment', label: 'A - 评估' }, { key: 'plan', label: 'P - 计划' }]
    : note.noteFormat === 'birp'
    ? [{ key: 'behavior', label: 'B - 行为' }, { key: 'intervention', label: 'I - 干预' }, { key: 'response', label: 'R - 反应' }, { key: 'plan', label: 'P - 计划' }]
    : [{ key: 'subjective', label: 'S - 主观资料' }, { key: 'objective', label: 'O - 客观资料' }, { key: 'assessment', label: 'A - 评估分析' }, { key: 'plan', label: 'P - 计划' }];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{formatLabel} 记录</span>
          <span className="text-xs text-slate-400">{note.sessionDate}</span>
          {note.duration && <span className="text-xs text-slate-400">{note.duration}分钟</span>}
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <button onClick={onEdit} className="flex items-center gap-1 px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 rounded">
              <Edit3 className="w-3 h-3" /> 编辑
            </button>
          )}
          {editing && (
            <button onClick={handleSave} disabled={updateNote.isPending}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-brand-600 text-white rounded hover:bg-brand-500 disabled:opacity-50">
              <Save className="w-3 h-3" /> {updateNote.isPending ? '保存中...' : '保存'}
            </button>
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {note.summary && (
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">摘要</div>
            <div className="text-sm text-slate-700">{note.summary}</div>
          </div>
        )}

        {fieldDefs.map((fd) => (
          <div key={fd.key}>
            <label className="block text-xs font-medium text-slate-500 mb-1">{fd.label}</label>
            {editing ? (
              <textarea
                value={fields[fd.key] || ''}
                onChange={(e) => setFields({ ...fields, [fd.key]: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            ) : (
              <div className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 min-h-[3rem]">
                {fields[fd.key] || <span className="text-slate-400">未填写</span>}
              </div>
            )}
          </div>
        ))}

        {note.tags && (note.tags as string[]).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(note.tags as string[]).map((tag) => (
              <span key={tag} className="px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full text-xs">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Left Panel ─────────────────────────────────────────────────

type BottomTab = 'referral' | 'followup' | 'consent';

function LeftPanel({ episodeId, clientId, onSelectNote }: {
  episodeId: string; clientId: string; onSelectNote: (note: SessionNote) => void;
}) {
  const { data: profile } = useClientProfile(clientId);
  const { data: allEpisodes } = useEpisodes({ clientId });
  const [viewingEpisodeId, setViewingEpisodeId] = useState(episodeId);

  const { data: sessionNotes } = useSessionNotes({ careEpisodeId: viewingEpisodeId });
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

  const isViewingCurrent = viewingEpisodeId === episodeId;
  const currentEp = allEpisodes?.find((e) => e.id === viewingEpisodeId);

  return (
    <div className="flex flex-col h-full">
      {/* Client basic info */}
      <div className="p-3 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {profile?.gender && <span>{genderLabels[profile.gender] || profile.gender}</span>}
          {age && <span>{age}</span>}
          {profile?.phone && <span>{profile.phone}</span>}
        </div>
        {(!profile || (!profile.phone && !profile.gender)) && (
          <div className="text-xs text-slate-400">基本信息未填写</div>
        )}
      </div>

      {/* Episode cycle selector */}
      {allEpisodes && allEpisodes.length > 1 && (
        <div className="px-3 py-2 border-b border-slate-200">
          <select
            value={viewingEpisodeId}
            onChange={(e) => setViewingEpisodeId(e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {allEpisodes.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.id === episodeId ? '当前：' : ''}{ep.chiefComplaint || '未填写主诉'}
                {' '}({statusLabels[ep.status]})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Viewing history banner */}
      {!isViewingCurrent && (
        <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
          <span className="text-xs text-amber-700">查看历史个案</span>
          <button onClick={() => setViewingEpisodeId(episodeId)} className="text-xs text-amber-600 hover:underline">
            返回当前
          </button>
        </div>
      )}

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
                    <div className="text-slate-700 truncate">{note.summary || `${(note.noteFormat || 'soap').toUpperCase()} 记录`}</div>
                    <div className="text-slate-400">{note.sessionDate}</div>
                  </div>
                  {expandedNote === note.id ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
                </button>
                {expandedNote === note.id && (
                  <div className="ml-7 mt-1 mb-2 p-2 bg-slate-50 rounded-lg text-xs space-y-1.5">
                    {note.subjective && <div><span className="font-medium text-slate-500">S:</span> <span className="text-slate-600 line-clamp-2">{note.subjective}</span></div>}
                    {note.objective && <div><span className="font-medium text-slate-500">O:</span> <span className="text-slate-600 line-clamp-2">{note.objective}</span></div>}
                    {note.assessment && <div><span className="font-medium text-slate-500">A:</span> <span className="text-slate-600 line-clamp-2">{note.assessment}</span></div>}
                    {note.plan && <div><span className="font-medium text-slate-500">P:</span> <span className="text-slate-600 line-clamp-2">{note.plan}</span></div>}
                    <button
                      onClick={() => onSelectNote(note)}
                      className="text-xs text-brand-600 hover:underline mt-1"
                    >
                      查看完整 / 编辑 →
                    </button>
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
                    {result.totalScore != null && <div><span className="text-slate-500">总分:</span> <span className="font-medium">{result.totalScore}</span></div>}
                    {result.dimensionScores && Object.entries(result.dimensionScores as Record<string, number>).map(([dim, score]) => (
                      <div key={dim}><span className="text-slate-500">{dim}:</span> {score}</div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Download */}
        {sessionNotes && sessionNotes.length > 0 && (
          <div className="px-3 pb-2">
            <button
              onClick={() => downloadEpisodeZip(viewingEpisodeId, currentEp?.chiefComplaint || '个案', sessionNotes, assessmentResults)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
            >
              <Download className="w-3 h-3" /> 导出本周期记录 (ZIP)
            </button>
          </div>
        )}
      </div>

      {/* Bottom tabs */}
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

// ─── ZIP Download ───────────────────────────────────────────────

function downloadEpisodeZip(episodeId: string, title: string, notes: any[], results: any[] | undefined) {
  // Build text content for download
  let content = `个案记录导出: ${title}\n导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;

  content += `${'='.repeat(50)}\n会谈记录 (${notes.length}次)\n${'='.repeat(50)}\n\n`;
  notes.forEach((note, i) => {
    content += `--- 第${notes.length - i}次 (${note.sessionDate}) ---\n`;
    if (note.summary) content += `摘要: ${note.summary}\n`;
    if (note.subjective) content += `S: ${note.subjective}\n`;
    if (note.objective) content += `O: ${note.objective}\n`;
    if (note.assessment) content += `A: ${note.assessment}\n`;
    if (note.plan) content += `P: ${note.plan}\n`;
    if (note.fields) {
      Object.entries(note.fields).forEach(([k, v]) => { content += `${k}: ${v}\n`; });
    }
    content += '\n';
  });

  if (results && results.length > 0) {
    content += `${'='.repeat(50)}\n评估记录 (${results.length}次)\n${'='.repeat(50)}\n\n`;
    results.forEach((r: any) => {
      content += `--- ${new Date(r.createdAt).toLocaleDateString('zh-CN')} ---\n`;
      if (r.totalScore != null) content += `总分: ${r.totalScore}\n`;
      if (r.dimensionScores) {
        Object.entries(r.dimensionScores as Record<string, number>).forEach(([k, v]) => {
          content += `  ${k}: ${v}\n`;
        });
      }
      content += '\n';
    });
  }

  // Download as text file (simplified - real ZIP would need archiver on backend)
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

import React, { useState, useEffect } from 'react';
import {
  useEpisodes, useSessionNotes, useReferrals, useUpdateReferral,
  useFollowUpPlans, useFollowUpReviews,
} from '../../../api/useCounseling';
import { useResults } from '../../../api/useAssessments';
import { useClientProfile } from '../../../api/useClientProfile';
import { useConsentDocuments } from '../../../api/useConsent';
import { useToast } from '../../../shared/components';
import {
  FileText, BarChart3, ChevronDown, ChevronUp,
  ArrowRightLeft, ClipboardList, FileCheck, Download,
} from 'lucide-react';
import { ReferralForm } from './ReferralForm';
import { ReferralCard } from './ReferralCard';
import { FollowUpPlanForm } from './FollowUpPlanForm';
import { FollowUpCard } from './FollowUpCard';
import { SendConsentForm } from './SendConsentForm';
import { downloadEpisodeZip } from './downloadEpisodeZip';
import type { SessionNote } from '@psynote/shared';

const statusLabels: Record<string, string> = {
  active: '进行中', paused: '暂停', closed: '已结案', archived: '已归档',
};

type BottomTab = 'referral' | 'followup' | 'consent';

interface Props {
  episodeId: string;
  clientId: string;
  onSelectNote: (note: SessionNote) => void;
}

export function LeftPanel({ episodeId, clientId, onSelectNote }: Props) {
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
  const [bottomHeight, setBottomHeight] = useState(200);
  const [draggingBottom, setDraggingBottom] = useState(false);
  const [showReferralForm, setShowReferralForm] = useState(false);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [showConsentForm, setShowConsentForm] = useState(false);

  useEffect(() => {
    if (!draggingBottom) return;
    const handleMove = (e: MouseEvent) => {
      const container = document.querySelector('[data-left-panel]');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newH = Math.max(100, Math.min(rect.bottom - e.clientY - 40, rect.height * 0.6));
      setBottomHeight(newH);
    };
    const handleUp = () => setDraggingBottom(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp); };
  }, [draggingBottom]);

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
    <div className="flex flex-col h-full" data-left-panel>
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
          <select value={viewingEpisodeId} onChange={(e) => setViewingEpisodeId(e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500">
            {allEpisodes.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.id === episodeId ? '当前：' : ''}{ep.chiefComplaint || '未填写主诉'} ({statusLabels[ep.status]})
              </option>
            ))}
          </select>
        </div>
      )}

      {!isViewingCurrent && (
        <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
          <span className="text-xs text-amber-700">查看历史个案</span>
          <button onClick={() => setViewingEpisodeId(episodeId)} className="text-xs text-amber-600 hover:underline">返回当前</button>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <SectionHeader icon={<FileText className="w-3.5 h-3.5" />} title="会谈记录" count={sessionNotes?.length} />
        <div className="px-3 pb-2 space-y-1">
          {(!sessionNotes || sessionNotes.length === 0) ? (
            <div className="text-xs text-slate-400 py-2">暂无会谈记录</div>
          ) : (
            sessionNotes.map((note, i) => (
              <div key={note.id}>
                <button onClick={() => setExpandedNote(expandedNote === note.id ? null : note.id)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition ${expandedNote === note.id ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 text-xs font-medium">{sessionNotes.length - i}</div>
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
                    <button onClick={() => onSelectNote(note)} className="text-xs text-brand-600 hover:underline mt-1">查看完整 / 编辑 →</button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <SectionHeader icon={<BarChart3 className="w-3.5 h-3.5" />} title="评估记录" count={assessmentResults?.length} />
        <div className="px-3 pb-2 space-y-1">
          {(!assessmentResults || assessmentResults.length === 0) ? (
            <div className="text-xs text-slate-400 py-2">暂无评估记录</div>
          ) : (
            assessmentResults.slice(0, 10).map((result: any) => (
              <div key={result.id}>
                <button onClick={() => setExpandedResult(expandedResult === result.id ? null : result.id)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition ${expandedResult === result.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0"><BarChart3 className="w-3 h-3" /></div>
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

        {sessionNotes && sessionNotes.length > 0 && (
          <div className="px-3 pb-2">
            <button onClick={() => downloadEpisodeZip(viewingEpisodeId, currentEp?.chiefComplaint || '个案', sessionNotes, assessmentResults)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">
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
            <button key={tab.key} onClick={() => setBottomTab(bottomTab === tab.key ? null : tab.key)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition ${bottomTab === tab.key ? 'text-brand-700 bg-brand-50' : 'text-slate-500 hover:bg-slate-50'}`}>
              {tab.icon} {tab.label}
              {tab.badge > 0 && <span className="w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs">{tab.badge}</span>}
            </button>
          ))}
        </div>

        {bottomTab && (
          <>
            <div className={`h-1 cursor-row-resize hover:bg-brand-300 transition-colors ${draggingBottom ? 'bg-brand-400' : 'bg-transparent'}`}
              onMouseDown={() => setDraggingBottom(true)} />
            <div className="overflow-y-auto p-3 space-y-2 border-t border-slate-100" style={{ height: bottomHeight }}>
              {bottomTab === 'referral' && (
                <>
                  <button onClick={() => setShowReferralForm(!showReferralForm)} className="text-xs text-brand-600 hover:underline">{showReferralForm ? '收起' : '+ 发起转介'}</button>
                  {showReferralForm && <ReferralForm episodeId={episodeId} clientId={clientId} onDone={() => setShowReferralForm(false)} />}
                  {(referrals || []).map((r) => (
                    <ReferralCard key={r.id} referral={r} isPending={updateReferral.isPending}
                      onStatusChange={async (status) => { try { await updateReferral.mutateAsync({ referralId: r.id, status }); toast('已更新', 'success'); } catch { toast('失败', 'error'); } }} />
                  ))}
                  {(!referrals || referrals.length === 0) && !showReferralForm && <div className="text-xs text-slate-400 text-center">暂无</div>}
                </>
              )}
              {bottomTab === 'followup' && (
                <>
                  <button onClick={() => setShowFollowUpForm(!showFollowUpForm)} className="text-xs text-brand-600 hover:underline">{showFollowUpForm ? '收起' : '+ 新建随访计划'}</button>
                  {showFollowUpForm && <FollowUpPlanForm episodeId={episodeId} onDone={() => setShowFollowUpForm(false)} />}
                  {(followUpPlans || []).map((plan) => (
                    <FollowUpCard key={plan.id} plan={plan} reviews={followUpReviews || []} episodeId={episodeId} currentRisk="level_1" onReviewCreated={() => {}} />
                  ))}
                  {(!followUpPlans || followUpPlans.length === 0) && !showFollowUpForm && <div className="text-xs text-slate-400 text-center">暂无</div>}
                </>
              )}
              {bottomTab === 'consent' && (
                <>
                  <button onClick={() => setShowConsentForm(!showConsentForm)} className="text-xs text-brand-600 hover:underline">{showConsentForm ? '收起' : '+ 发送协议'}</button>
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
          </>
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

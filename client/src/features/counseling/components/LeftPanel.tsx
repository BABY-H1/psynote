import React, { useState, useEffect } from 'react';
import {
  useEpisodes, useSessionNotes, useReferrals, useUpdateReferral,
  useFollowUpPlans, useFollowUpReviews, useAiConversations,
} from '../../../api/useCounseling';
import { useResults } from '../../../api/useAssessments';
import { useClientProfile } from '../../../api/useClientProfile';
import { useConsentDocuments } from '../../../api/useConsent';
import { useToast } from '../../../shared/components';
import {
  FileText, BarChart3, ChevronDown, MessageSquare,
  ArrowRightLeft, ClipboardList, FileCheck, Download,
  Target, Users, GraduationCap,
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
  onSelectResult?: (result: any) => void;
  onSelectConversation?: (conv: any) => void;
}

export function LeftPanel({ episodeId, clientId, onSelectNote, onSelectResult, onSelectConversation }: Props) {
  const { data: profile } = useClientProfile(clientId);
  const { data: allEpisodes } = useEpisodes({ clientId });
  const [viewingEpisodeId, setViewingEpisodeId] = useState(episodeId);

  // 5 sections 各自折叠状态, 持久化到 localStorage 跨 episode 共享偏好.
  const [sessionCollapsed, toggleSession] = useSectionCollapse('session');
  const [assessmentCollapsed, toggleAssessment] = useSectionCollapse('assessment');
  const [planCollapsed, togglePlan] = useSectionCollapse('plan');
  const [simulateCollapsed, toggleSimulate] = useSectionCollapse('simulate');
  const [superviseCollapsed, toggleSupervise] = useSectionCollapse('supervise');

  const { data: sessionNotes } = useSessionNotes({ careEpisodeId: viewingEpisodeId });
  const { data: assessmentResults } = useResults({ userId: clientId });
  const { data: referrals } = useReferrals(episodeId);
  const updateReferral = useUpdateReferral();
  const { data: followUpPlans } = useFollowUpPlans(episodeId);
  const { data: followUpReviews } = useFollowUpReviews(episodeId);
  const { data: consentDocs } = useConsentDocuments({ clientId, careEpisodeId: episodeId });
  const { data: aiConversations } = useAiConversations({ careEpisodeId: viewingEpisodeId });
  const { toast } = useToast();
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
        {/*
          Phase I Issue 1: 会谈记录区按 sessionNote 渲染主行 + 关联的 note-mode
          AI 对话作为子条目 (草稿过程). 没保存为 sessionNote 的 note 草稿
          (sessionNoteId IS NULL) 单独作为 "未保存的笔记草稿" 列在最上面.
        */}
        {(() => {
          const noteDrafts = (aiConversations || []).filter((c: any) => c.mode === 'note' && !c.sessionNoteId);
          const noteDraftBySessionId = new Map<string, any>();
          for (const c of (aiConversations || [])) {
            if (c.mode === 'note' && c.sessionNoteId) {
              noteDraftBySessionId.set(c.sessionNoteId, c);
            }
          }
          const totalCount = (sessionNotes?.length || 0) + noteDrafts.length;
          return (
            <>
              <SectionHeader
                icon={<FileText className="w-3.5 h-3.5" />}
                title="会谈记录"
                count={totalCount}
                sectionKey="session"
                collapsed={sessionCollapsed}
                onToggle={toggleSession}
              />
              {!sessionCollapsed && (
              <div className="px-3 pb-2 space-y-1">
                {noteDrafts.length === 0 && (!sessionNotes || sessionNotes.length === 0) ? (
                  <div className="text-xs text-slate-400 py-2">暂无会谈记录</div>
                ) : (
                  <>
                    {/* 未保存的笔记草稿 — 浅灰底, 点击载入 ChatWorkspace 续写 */}
                    {noteDrafts.map((draft: any) => (
                      <button key={draft.id}
                        onClick={() => onSelectConversation?.(draft)}
                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition hover:bg-emerald-50 bg-slate-50/60 border border-dashed border-slate-200">
                        <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0 text-xs">📝</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-slate-600 truncate italic">{draft.title || '笔记草稿'} <span className="text-slate-400 not-italic">(未保存)</span></div>
                          <div className="text-slate-400">{(draft.messages as any[])?.length || 0} 条 · {new Date(draft.updatedAt).toLocaleDateString('zh-CN')}</div>
                        </div>
                        <ChevronDown className="w-3 h-3 text-slate-400 rotate-[-90deg]" />
                      </button>
                    ))}
                    {/* 已保存的 sessionNote — 主行 + 可选关联草稿子行 */}
                    {sessionNotes && sessionNotes.map((note, i) => {
                      const linkedDraft = noteDraftBySessionId.get(note.id);
                      return (
                        <div key={note.id} className="space-y-1">
                          <button
                            onClick={() => onSelectNote(note)}
                            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition hover:bg-emerald-50">
                            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 text-xs font-medium">{sessionNotes.length - i}</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-slate-700 truncate">{note.summary || `${(note.noteFormat || 'soap').toUpperCase()} 记录`}</div>
                              <div className="text-slate-400">{note.sessionDate}</div>
                            </div>
                            <ChevronDown className="w-3 h-3 text-slate-400 rotate-[-90deg]" />
                          </button>
                          {linkedDraft && (
                            <button
                              onClick={() => onSelectConversation?.(linkedDraft)}
                              className="w-full text-left flex items-center gap-2 px-2 py-1 ml-5 rounded text-[11px] text-slate-500 hover:bg-slate-50 transition">
                              <span>📝</span>
                              <span className="flex-1 truncate">AI 草稿过程 · {(linkedDraft.messages as any[])?.length || 0} 条</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
              )}
            </>
          );
        })()}

        <SectionHeader
          icon={<BarChart3 className="w-3.5 h-3.5" />}
          title="评估记录"
          count={assessmentResults?.length}
          sectionKey="assessment"
          collapsed={assessmentCollapsed}
          onToggle={toggleAssessment}
        />
        {!assessmentCollapsed && (
        <div className="px-3 pb-2 space-y-1">
          {(!assessmentResults || assessmentResults.length === 0) ? (
            <div className="text-xs text-slate-400 py-2">暂无评估记录</div>
          ) : (
            assessmentResults.slice(0, 10).map((result: any) => {
              const scaleLabel = result.scaleTitles?.join(' / ') || result.assessmentTitle || '测评';
              const firstInterp = result.interpretations?.[0];
              const resultLabel = firstInterp?.label || '';

              return (
                <button key={result.id}
                  onClick={() => onSelectResult?.(result)}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition hover:bg-blue-50">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0"><BarChart3 className="w-3 h-3" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-700 truncate">
                      {scaleLabel}
                      {result.totalScore != null && <span className="text-slate-500"> · {result.totalScore}分</span>}
                      {resultLabel && <span className="text-slate-500"> · {resultLabel}</span>}
                    </div>
                    <div className="text-slate-400">{new Date(result.createdAt).toLocaleDateString('zh-CN')}</div>
                  </div>
                  <ChevronDown className="w-3 h-3 text-slate-400 rotate-[-90deg]" />
                </button>
              );
            })
          )}
        </div>
        )}

        {/*
          Phase I follow-up: 之前 plan/simulate/supervise 平铺在 "AI 对话" 区,
          用户反馈混在一起不易找特定 mode 历史. 改成 3 mode 各自独立 section
          (跟"会谈记录" / "评估记录" 的"按内容类型分组"一致). 空 mode 隐藏
          整个 section, 避免占空间. 第一次产生该 mode 的 conversation 时
          section 自动出现.
        */}
        {(['plan', 'simulate', 'supervise'] as const).map((targetMode) => {
          const meta = ({
            plan: { emoji: '🎯', label: '治疗方案', icon: <Target className="w-3.5 h-3.5" />, hoverBg: 'hover:bg-teal-50' },
            simulate: { emoji: '🗣️', label: '模拟练习', icon: <Users className="w-3.5 h-3.5" />, hoverBg: 'hover:bg-violet-50' },
            supervise: { emoji: '🎓', label: '督导对话', icon: <GraduationCap className="w-3.5 h-3.5" />, hoverBg: 'hover:bg-amber-50' },
          } as const)[targetMode];
          const filtered = (aiConversations || []).filter((c: any) => c.mode === targetMode);
          if (filtered.length === 0) return null;
          // 同名变量避免 closure 引用问题, 把折叠 state 解到 outer
          const collapsed = targetMode === 'plan' ? planCollapsed : targetMode === 'simulate' ? simulateCollapsed : superviseCollapsed;
          const onToggle = targetMode === 'plan' ? togglePlan : targetMode === 'simulate' ? toggleSimulate : toggleSupervise;
          return (
            <React.Fragment key={targetMode}>
              <SectionHeader
                icon={meta.icon}
                title={meta.label}
                count={filtered.length}
                sectionKey={targetMode}
                collapsed={collapsed}
                onToggle={onToggle}
              />
              {!collapsed && (
              <div className="px-3 pb-2 space-y-1">
                {filtered.map((conv: any) => {
                  const msgCount = (conv.messages as any[])?.length || 0;
                  return (
                    <button key={conv.id}
                      onClick={() => onSelectConversation?.(conv)}
                      className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition ${meta.hoverBg}`}>
                      <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0 text-xs">{meta.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-slate-700 truncate">{conv.title || meta.label}</div>
                        <div className="text-slate-400">{msgCount}条 · {new Date(conv.updatedAt).toLocaleDateString('zh-CN')}</div>
                      </div>
                      <ChevronDown className="w-3 h-3 text-slate-400 rotate-[-90deg]" />
                    </button>
                  );
                })}
              </div>
              )}
            </React.Fragment>
          );
        })}

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

/*
 * SectionHeader: 可折叠. 状态按 sectionKey 持久化到 localStorage, 跨 episode
 * 共享偏好 (用户折叠"督导对话" 后, 其他 episode 也默认折叠).
 *   - 不传 sectionKey: 退化为不可折叠 (跟旧版一致).
 *   - 传 sectionKey: 显示 chevron, 点击 toggle. children 只在展开时渲染.
 *
 * collapsed=true → children 不渲染 (节省 DOM).
 */
function SectionHeader({
  icon, title, count, sectionKey, collapsed, onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  sectionKey?: string;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const isCollapsible = !!sectionKey;
  return (
    <button
      type="button"
      onClick={isCollapsible ? onToggle : undefined}
      className={`w-full flex items-center gap-1.5 px-3 pt-3 pb-1 text-left ${
        isCollapsible ? 'hover:bg-slate-50 transition cursor-pointer' : 'cursor-default'
      }`}
    >
      {isCollapsible && (
        <ChevronDown
          className={`w-3 h-3 text-slate-400 flex-shrink-0 transition-transform ${
            collapsed ? '-rotate-90' : ''
          }`}
        />
      )}
      <span className="text-slate-400">{icon}</span>
      <span className="text-xs font-medium text-slate-500">{title}</span>
      {count != null && count > 0 && <span className="text-xs text-slate-400">({count})</span>}
    </button>
  );
}

/*
 * useSectionCollapse: 持久化折叠状态. key 用 'leftpanel:section:<name>'
 * 存 boolean. 默认全展开 (false). 用户改了就记住.
 */
function useSectionCollapse(name: string) {
  const storageKey = `leftpanel:section:${name}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(storageKey, '1');
        else localStorage.removeItem(storageKey);
      } catch {}
      return next;
    });
  };
  return [collapsed, toggle] as const;
}

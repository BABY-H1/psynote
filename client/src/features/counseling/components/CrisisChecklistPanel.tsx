/**
 * 危机处置清单面板 (Phase 13).
 *
 * 挂载位置: EpisodeDetail 的 OutputPanel, 当 mode === 'crisis' 时显示.
 * 只有 intervention_type = 'crisis' 的 episode 才会进入这个 mode.
 *
 * 功能:
 *   - 展示 5 步清单:再评估访谈 / 家长联系留痕 / 发放文书 / 转介 / 追踪
 *   - 每步内联完成(访谈摘要 / 家长联系表单 / 文书发放 / 转介跳转提示 / 追踪跳转提示)
 *   - 必做步骤(reinterview, parentContact)完成后可提交结案审核
 *   - 督导视角: 当案件 stage='pending_sign_off' 时显示审核区
 *
 * 系统边界提示:
 *   - 顶部始终显示 NoAutoContactDisclaimer
 *   - "家长联系留痕" 明确说明系统不联系家长,老师自行站外沟通
 *   - 文书发放是给家长的线下交付留痕,不走来访者门户签名
 */
import React, { useState, useMemo } from 'react';
import {
  AlertTriangle, CheckCircle2, Circle, ChevronDown, ChevronRight,
  FileText, Phone, FilePlus, ArrowRightLeft, ClipboardList,
  Loader2, Send, XCircle, Clock,
} from 'lucide-react';
import type {
  CrisisCase,
  CrisisChecklist,
  CrisisChecklistStepKey,
  ParentContactStep,
  ReinterviewStep,
} from '@psynote/shared';
import {
  CRISIS_REQUIRED_STEPS,
  CRISIS_STEP_LABELS,
  CRISIS_STAGE_LABELS,
  PARENT_CONTACT_METHOD_LABELS,
} from '@psynote/shared';
import {
  useUpdateCrisisChecklistStep,
  useSubmitCrisisForSignOff,
  useSignOffCrisisCase,
} from '../../../api/useCrisisCase';
import { useSessionNotes } from '../../../api/useCounseling';
import { useAuthStore } from '../../../stores/authStore';
import { useToast } from '../../../shared/components';
import { NoAutoContactDisclaimer } from '../../workflow/NoAutoContactDisclaimer';
import { SendConsentForm } from './SendConsentForm';
import { ParentContactForm } from './ParentContactForm';

interface Props {
  crisisCase: CrisisCase;
  episodeId: string;
  clientId: string;
  clientName?: string;
}

/**
 * Returns whether the current user is able to act as a supervisor
 * (sign off / bounce back) for the given case.
 *
 * Server-side the set is: org_admin OR counselor w/ fullPracticeAccess.
 * Client state only tracks `currentRole` so we accept org_admin here; if a
 * counselor w/ fullPracticeAccess needs to sign off, they'll still see the
 * button after the server accepts their call (we're only rendering the UI
 * optimistically here — server RBAC is the authoritative check).
 */
function useIsSupervisor(): boolean {
  const user = useAuthStore((s) => s.user);
  const currentRole = useAuthStore((s) => s.currentRole);
  if (!user) return false;
  return currentRole === 'org_admin';
}

export function CrisisChecklistPanel({ crisisCase, episodeId, clientId, clientName }: Props) {
  const { toast } = useToast();
  const userId = useAuthStore((s) => s.user?.id);
  const isSupervisor = useIsSupervisor();

  const updateStep = useUpdateCrisisChecklistStep();
  const submitForSignOff = useSubmitCrisisForSignOff();
  const signOff = useSignOffCrisisCase();

  const checklist = crisisCase.checklist || {};
  const [expanded, setExpanded] = useState<CrisisChecklistStepKey | null>(() => {
    // Default: expand first incomplete required step
    for (const key of CRISIS_REQUIRED_STEPS) {
      if (!checklist[key]?.done) return key;
    }
    return null;
  });

  const toggle = (key: CrisisChecklistStepKey) => {
    setExpanded(expanded === key ? null : key);
  };

  const canSubmit = useMemo(() => {
    return CRISIS_REQUIRED_STEPS.every((k) => checklist[k]?.done);
  }, [checklist]);

  const readonly = crisisCase.stage === 'closed';
  const awaitingSignOff = crisisCase.stage === 'pending_sign_off';

  const handleStepUpdate = async <K extends CrisisChecklistStepKey>(
    stepKey: K,
    payload: CrisisChecklist[K],
  ) => {
    try {
      await updateStep.mutateAsync({
        caseId: crisisCase.id,
        stepKey,
        payload: payload as never,
      });
      toast(`${CRISIS_STEP_LABELS[stepKey]}已更新`, 'success');
    } catch (err: any) {
      toast(err?.message || '保存失败', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-red-50/30">
      {/* Header */}
      <div className="bg-red-600 text-white px-4 py-3 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          <div className="flex-1">
            <div className="font-semibold text-sm">危机处置清单</div>
            <div className="text-xs text-red-100">
              {clientName || '来访者'} · 当前状态: {CRISIS_STAGE_LABELS[crisisCase.stage]}
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        <NoAutoContactDisclaimer />

        {/* Stage banner */}
        {awaitingSignOff && !isSupervisor && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
            <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">案件已提交督导审核</div>
              <div>等待督导确认后结案。如需修改,请联系督导退回。</div>
            </div>
          </div>
        )}

        {crisisCase.stage === 'reopened' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <div className="font-medium mb-1">督导已退回修改</div>
            {crisisCase.supervisorNote && <div className="text-amber-700">{crisisCase.supervisorNote}</div>}
          </div>
        )}

        {crisisCase.stage === 'closed' && (
          <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 text-xs text-slate-700">
            <div className="font-medium mb-1">✓ 案件已结案</div>
            {crisisCase.closureSummary && <div className="text-slate-600">{crisisCase.closureSummary}</div>}
            {crisisCase.supervisorNote && <div className="text-slate-500 mt-1">督导备注: {crisisCase.supervisorNote}</div>}
          </div>
        )}

        {/* Checklist items */}
        <div className="space-y-2">
          <ChecklistItem
            stepKey="reinterview"
            checklist={checklist}
            expanded={expanded === 'reinterview'}
            readonly={readonly}
            onToggle={() => toggle('reinterview')}
            icon={<FileText className="w-4 h-4" />}
          >
            <ReinterviewStepContent
              episodeId={episodeId}
              current={checklist.reinterview}
              submitting={updateStep.isPending}
              onSave={(data) => handleStepUpdate('reinterview', data)}
              readonly={readonly}
            />
          </ChecklistItem>

          <ChecklistItem
            stepKey="parentContact"
            checklist={checklist}
            expanded={expanded === 'parentContact'}
            readonly={readonly}
            onToggle={() => toggle('parentContact')}
            icon={<Phone className="w-4 h-4" />}
          >
            {checklist.parentContact?.done && !readonly && expanded === 'parentContact' && (
              <ParentContactSummary step={checklist.parentContact} />
            )}
            {!readonly && (
              <ParentContactForm
                initial={checklist.parentContact}
                submitting={updateStep.isPending}
                onSubmit={(data) => handleStepUpdate('parentContact', data)}
              />
            )}
            {readonly && checklist.parentContact && <ParentContactSummary step={checklist.parentContact} />}
          </ChecklistItem>

          <ChecklistItem
            stepKey="documents"
            checklist={checklist}
            expanded={expanded === 'documents'}
            readonly={readonly}
            onToggle={() => toggle('documents')}
            icon={<FilePlus className="w-4 h-4" />}
          >
            {!readonly && (
              <SendConsentForm
                clientId={clientId}
                careEpisodeId={episodeId}
                defaultRecipient="guardian"
                defaultRecipientName={checklist.parentContact?.contactName}
                onDone={() => {}}
                onCreated={async (documentIds) => {
                  const merged = [
                    ...(checklist.documents?.documentIds || []),
                    ...documentIds,
                  ];
                  await handleStepUpdate('documents', {
                    done: merged.length > 0,
                    documentIds: merged,
                  });
                }}
              />
            )}
            {checklist.documents?.documentIds && checklist.documents.documentIds.length > 0 && (
              <div className="mt-3 text-xs text-slate-500">
                已生成 {checklist.documents.documentIds.length} 份文书(线下交付留痕)
              </div>
            )}
          </ChecklistItem>

          <ChecklistItem
            stepKey="referral"
            checklist={checklist}
            expanded={expanded === 'referral'}
            readonly={readonly}
            onToggle={() => toggle('referral')}
            icon={<ArrowRightLeft className="w-4 h-4" />}
          >
            <StepWithExternalAction
              stepKey="referral"
              current={checklist.referral}
              readonly={readonly}
              submitting={updateStep.isPending}
              actionHint="转介去左侧「转介」tab 发起(转介单可以是本机构其他咨询师,也可以是合作医院)"
              onMarkDone={() => handleStepUpdate('referral', { done: true, completedAt: new Date().toISOString() })}
              onSkip={(reason) => handleStepUpdate('referral', { done: false, skipped: true, skipReason: reason })}
              onReset={() => handleStepUpdate('referral', { done: false, skipped: false })}
            />
          </ChecklistItem>

          <ChecklistItem
            stepKey="followUp"
            checklist={checklist}
            expanded={expanded === 'followUp'}
            readonly={readonly}
            onToggle={() => toggle('followUp')}
            icon={<ClipboardList className="w-4 h-4" />}
          >
            <StepWithExternalAction
              stepKey="followUp"
              current={checklist.followUp}
              readonly={readonly}
              submitting={updateStep.isPending}
              actionHint="追踪随访去左侧「随访」tab 新建随访计划(例如一周后复评 + 两周后回访)"
              onMarkDone={() => handleStepUpdate('followUp', { done: true, completedAt: new Date().toISOString() })}
              onSkip={(reason) => handleStepUpdate('followUp', { done: false, skipped: true, skipReason: reason })}
              onReset={() => handleStepUpdate('followUp', { done: false, skipped: false })}
            />
          </ChecklistItem>
        </div>

        {/* Submit / Sign-off */}
        {crisisCase.stage === 'open' || crisisCase.stage === 'reopened' ? (
          <SubmitSection
            canSubmit={canSubmit}
            submitting={submitForSignOff.isPending}
            existingSummary={crisisCase.closureSummary}
            onSubmit={async (summary) => {
              try {
                await submitForSignOff.mutateAsync({ caseId: crisisCase.id, closureSummary: summary });
                toast('已提交督导审核,等待确认', 'success');
              } catch (err: any) {
                toast(err?.message || '提交失败', 'error');
              }
            }}
          />
        ) : awaitingSignOff && isSupervisor ? (
          <SignOffSection
            crisisCase={crisisCase}
            submitting={signOff.isPending}
            onAction={async (approve, note) => {
              try {
                await signOff.mutateAsync({ caseId: crisisCase.id, approve, supervisorNote: note });
                toast(approve ? '已确认结案' : '已退回修改', 'success');
              } catch (err: any) {
                toast(err?.message || '操作失败', 'error');
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

// ─── ChecklistItem shell ────────────────────────────────────────

function ChecklistItem({
  stepKey, checklist, expanded, readonly, onToggle, icon, children,
}: {
  stepKey: CrisisChecklistStepKey;
  checklist: CrisisChecklist;
  expanded: boolean;
  readonly: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const step = checklist[stepKey];
  const done = !!step?.done;
  const skipped = !!step?.skipped;
  const required = CRISIS_REQUIRED_STEPS.includes(stepKey);

  let badge: React.ReactNode;
  if (done) badge = <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
  else if (skipped) badge = <XCircle className="w-4 h-4 text-slate-400" />;
  else badge = <Circle className="w-4 h-4 text-slate-400" />;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 transition"
      >
        {badge}
        <span className="text-slate-500">{icon}</span>
        <span className="flex-1 text-left text-sm font-medium text-slate-900">
          {CRISIS_STEP_LABELS[stepKey]}
          {required && <span className="ml-1 text-[10px] text-red-500">必做</span>}
          {skipped && <span className="ml-1 text-[10px] text-slate-400">已跳过</span>}
        </span>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-slate-100">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Step: reinterview ──────────────────────────────────────────

function ReinterviewStepContent({
  episodeId, current, submitting, onSave, readonly,
}: {
  episodeId: string;
  current?: ReinterviewStep;
  submitting: boolean;
  onSave: (data: ReinterviewStep) => void;
  readonly: boolean;
}) {
  const { data: notes = [] } = useSessionNotes({ careEpisodeId: episodeId });
  const [summary, setSummary] = useState(current?.summary || '');
  const [noteId, setNoteId] = useState(current?.noteId || '');

  if (readonly) {
    return (
      <div className="text-sm text-slate-600 pt-3 space-y-1">
        {current?.summary && <div><span className="text-slate-400">摘要: </span>{current.summary}</div>}
        {current?.noteId && <div className="text-xs text-slate-400">已关联会谈记录 {current.noteId.slice(0, 8)}...</div>}
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-3">
      <div className="text-xs text-slate-500">
        ① 写访谈记录请使用左侧「会谈记录」的现有入口(或在本页切到「写笔记」mode)
        <br />② 完成后回到此处,关联你写的那条 note 即可打勾
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">访谈要点摘要</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="简要记录这次危机再评估访谈的核心判断(详细内容请写在会谈记录里)"
          rows={3}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">关联会谈记录(可选)</label>
        <select
          value={noteId}
          onChange={(e) => setNoteId(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          <option value="">— 不关联具体 note —</option>
          {notes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.sessionDate} · {n.summary || (n.noteFormat || 'soap').toUpperCase()}
            </option>
          ))}
        </select>
        {notes.length === 0 && (
          <div className="text-xs text-amber-600 mt-1">本案件下暂无会谈记录,请先在「写笔记」mode 中写一条</div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => onSave({
            done: true,
            summary: summary.trim() || undefined,
            noteId: noteId || undefined,
            completedAt: new Date().toISOString(),
          })}
          disabled={submitting || !summary.trim()}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? '保存中...' : (current?.done ? '更新' : '标记完成')}
        </button>
      </div>
    </div>
  );
}

// ─── Step: parentContact display ────────────────────────────────

function ParentContactSummary({ step }: { step: ParentContactStep }) {
  return (
    <div className="text-sm text-slate-600 pt-3 space-y-1 bg-slate-50 rounded-lg p-2 mb-3">
      <div className="text-xs text-slate-400">已联系记录:</div>
      <div>
        <span className="font-medium">{PARENT_CONTACT_METHOD_LABELS[step.method || 'other']}</span>
        {step.contactName && <span className="ml-2">· {step.contactName}</span>}
        {step.contactedAt && (
          <span className="ml-2 text-xs text-slate-400">
            {new Date(step.contactedAt).toLocaleString('zh-CN')}
          </span>
        )}
      </div>
      {step.summary && <div className="text-xs text-slate-500">{step.summary}</div>}
    </div>
  );
}

// ─── Step: referral / followUp (external action) ────────────────

function StepWithExternalAction({
  stepKey, current, readonly, submitting,
  actionHint, onMarkDone, onSkip, onReset,
}: {
  stepKey: CrisisChecklistStepKey;
  current?: { done?: boolean; skipped?: boolean; skipReason?: string };
  readonly: boolean;
  submitting: boolean;
  actionHint: string;
  onMarkDone: () => void;
  onSkip: (reason: string) => void;
  onReset: () => void;
}) {
  const [skipReason, setSkipReason] = useState(current?.skipReason || '');
  const [showSkip, setShowSkip] = useState(false);

  if (readonly) {
    return (
      <div className="text-sm text-slate-600 pt-3">
        {current?.done && <div>✓ 已完成</div>}
        {current?.skipped && (
          <>
            <div>跳过原因:</div>
            <div className="text-xs text-slate-500">{current.skipReason || '(未填)'}</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-3 text-sm">
      <div className="text-xs text-slate-500">{actionHint}</div>

      {showSkip ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600">跳过原因</label>
          <textarea
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="例如: 本次风险已降至 level_2,暂无转介必要"
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowSkip(false); setSkipReason(current?.skipReason || ''); }}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={() => { if (skipReason.trim()) { onSkip(skipReason.trim()); setShowSkip(false); } }}
              disabled={!skipReason.trim() || submitting}
              className="px-3 py-1.5 bg-slate-600 text-white rounded-lg text-xs hover:bg-slate-700 disabled:opacity-50"
            >
              确认跳过
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          {!current?.done && !current?.skipped && (
            <>
              <button
                onClick={onMarkDone}
                disabled={submitting}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700 disabled:opacity-50"
              >
                已完成(勾选)
              </button>
              <button
                onClick={() => setShowSkip(true)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
              >
                跳过并填理由
              </button>
            </>
          )}
          {(current?.done || current?.skipped) && (
            <button
              onClick={onReset}
              disabled={submitting}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
            >
              重置(撤销)
            </button>
          )}
        </div>
      )}

      {current?.skipped && !showSkip && (
        <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded">
          已跳过 · 原因: {current.skipReason || '(未填)'}
        </div>
      )}
    </div>
  );
}

// ─── Submit for sign-off ────────────────────────────────────────

function SubmitSection({
  canSubmit, submitting, existingSummary, onSubmit,
}: {
  canSubmit: boolean;
  submitting: boolean;
  existingSummary: string | null;
  onSubmit: (summary: string) => void;
}) {
  const [summary, setSummary] = useState(existingSummary || '');

  return (
    <div className="bg-white border-2 border-red-200 rounded-xl p-4 space-y-3 mt-4">
      <div className="font-semibold text-sm text-slate-900">提交督导审核结案</div>
      <div className="text-xs text-slate-500">
        必做步骤(再评估访谈 + 家长联系留痕)完成后可提交,督导审核通过后案件正式结案
      </div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="结案摘要 — 说明本次危机的核心判断、已完成动作、当前状态与后续安排"
        rows={4}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
      />
      {!canSubmit && (
        <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
          请先完成必做步骤(再评估访谈 + 家长联系留痕)
        </div>
      )}
      <div className="flex justify-end">
        <button
          onClick={() => onSubmit(summary)}
          disabled={!canSubmit || !summary.trim() || submitting}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          提交审核
        </button>
      </div>
    </div>
  );
}

// ─── Supervisor sign-off ────────────────────────────────────────

function SignOffSection({
  crisisCase, submitting, onAction,
}: {
  crisisCase: CrisisCase;
  submitting: boolean;
  onAction: (approve: boolean, note?: string) => void;
}) {
  const [note, setNote] = useState('');

  return (
    <div className="bg-white border-2 border-amber-300 rounded-xl p-4 space-y-3 mt-4">
      <div className="font-semibold text-sm text-slate-900">督导审核</div>
      <div className="bg-slate-50 rounded-lg p-3 space-y-2">
        <div className="text-xs font-medium text-slate-500">咨询师提交的结案摘要</div>
        <div className="text-sm text-slate-700 whitespace-pre-wrap">{crisisCase.closureSummary || '(未填)'}</div>
        {crisisCase.submittedForSignOffAt && (
          <div className="text-xs text-slate-400">
            提交于 {new Date(crisisCase.submittedForSignOffAt).toLocaleString('zh-CN')}
          </div>
        )}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="审核备注(可选) — 退回修改时请说明需要补充的内容"
        rows={3}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => onAction(false, note)}
          disabled={submitting}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          退回修改
        </button>
        <button
          onClick={() => onAction(true, note)}
          disabled={submitting}
          className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          确认结案
        </button>
      </div>
    </div>
  );
}

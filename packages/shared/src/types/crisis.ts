/**
 * Crisis handling case types — Phase 13.
 *
 * A crisis case is a structured wrapper around a care episode that captures
 * the 5-step supervised-crisis workflow the counselor follows after
 * accepting a `crisis_candidate` from the candidate pool.
 *
 * The system NEVER auto-contacts parents or external agencies. Every step is
 * human-driven — the checklist just tracks completion state so counselors
 * have guidance, organisations have留痕, and supervisors can sign off before
 * closure.
 */

// ─── Checklist shape ────────────────────────────────────────────

export type CrisisChecklistStepKey =
  | 'reinterview'    // 再评估访谈
  | 'parentContact'  // 家长联系留痕
  | 'documents'      // 发放文书
  | 'referral'       // 转介
  | 'followUp';      // 追踪

/** Labels shown in the UI for each step */
export const CRISIS_STEP_LABELS: Record<CrisisChecklistStepKey, string> = {
  reinterview: '再评估访谈',
  parentContact: '家长联系留痕',
  documents: '发放文书',
  referral: '转介',
  followUp: '追踪随访',
};

/** Steps that MUST be completed before the case can be submitted for sign-off */
export const CRISIS_REQUIRED_STEPS: CrisisChecklistStepKey[] = ['reinterview', 'parentContact'];

/**
 * 家长/监护人联系方式
 *   phone     电话
 *   wechat    微信
 *   in_person 面谈
 *   other     其他
 */
export type ParentContactMethod = 'phone' | 'wechat' | 'in_person' | 'other';

export const PARENT_CONTACT_METHOD_LABELS: Record<ParentContactMethod, string> = {
  phone: '电话',
  wechat: '微信',
  in_person: '面谈',
  other: '其他',
};

/** Common base — every step has done + completedAt */
interface BaseStepState {
  done: boolean;
  completedAt?: string | null;
  /** User marked this step as skipped (only allowed for non-required steps). */
  skipped?: boolean;
  skipReason?: string;
}

export interface ReinterviewStep extends BaseStepState {
  /** Linked session_note id (the re-interview is written as a session note) */
  noteId?: string;
  /** Optional one-line summary for the checklist card */
  summary?: string;
}

export interface ParentContactStep extends BaseStepState {
  method?: ParentContactMethod;
  /** e.g. "母亲 王某" / "监护人 李某" */
  contactName?: string;
  /** Time of actual contact (may differ from completedAt) */
  contactedAt?: string;
  /** What was communicated + response */
  summary?: string;
}

export interface DocumentsStep extends BaseStepState {
  /** client_documents.id values for each issued document (guardian-recipient) */
  documentIds?: string[];
}

export interface ReferralStep extends BaseStepState {
  /** referrals.id if one was created through LeftPanel and linked back here */
  referralId?: string;
}

export interface FollowUpStep extends BaseStepState {
  /** follow_up_plans.id if one was created and linked back here */
  followUpId?: string;
}

/**
 * Full checklist JSON shape stored in `crisis_cases.checklist`.
 * Missing keys are treated as `{ done: false }`.
 */
export interface CrisisChecklist {
  reinterview?: ReinterviewStep;
  parentContact?: ParentContactStep;
  documents?: DocumentsStep;
  referral?: ReferralStep;
  followUp?: FollowUpStep;
}

// ─── Case entity ───────────────────────────────────────────────

export type CrisisCaseStage =
  | 'open'              // counselor is handling
  | 'pending_sign_off'  // submitted, waiting for supervisor
  | 'closed'            // supervisor signed off
  | 'reopened';         // supervisor bounced back to counselor

export const CRISIS_STAGE_LABELS: Record<CrisisCaseStage, string> = {
  open: '处置中',
  pending_sign_off: '待督导审核',
  closed: '已结案',
  reopened: '已退回修改',
};

export interface CrisisCase {
  id: string;
  orgId: string;
  episodeId: string;
  candidateId: string | null;
  stage: CrisisCaseStage;
  checklist: CrisisChecklist;
  closureSummary: string | null;
  supervisorNote: string | null;
  signedOffBy: string | null;
  signedOffAt: string | null;
  submittedForSignOffAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response of POST /candidates/:id/accept for crisis candidates — lets the
 * client know which episode to navigate to.
 */
export interface CrisisAcceptResponse {
  candidateId: string;
  episodeId: string;
  crisisCaseId: string;
}

// ─── Client document recipient type (Phase 13) ────────────────

/**
 * client_documents.recipient_type values
 *   client   — normal, sent to the client themselves
 *   guardian — crisis workflow: sent to parent/guardian, counselor delivers
 *              offline, client_portal does NOT show this to the client user
 */
export type DocumentRecipientType = 'client' | 'guardian';

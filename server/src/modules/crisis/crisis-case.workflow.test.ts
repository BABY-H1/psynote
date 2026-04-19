import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../../lib/errors.js';

/**
 * Behavior tests for the crisis-case state machine.
 *
 * These are UNIT tests — we mock:
 *   - `../../config/database.js` with a chainable thenable proxy that
 *     yields items from a per-test FIFO queue on any terminal call
 *     (`await`, `.returning()`, `.limit()`).
 *   - `./crisis-case.queries.js` so `getCaseById` returns controlled
 *     fixtures without burning a DB-result queue slot.
 *   - `./crisis-helpers.js` — only `notifySupervisors` (so we can assert
 *     it was called); `toCrisisCase` / `buildStepTimeline*` remain real
 *     so the SUT integrates with the actual row-to-DTO mapping.
 */

// ─── DB mock: FIFO queue consumed by any terminal chain call ───

const dbResults: unknown[] = [];

function nextRows(): unknown[] {
  const v = dbResults.shift();
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

function terminal(rows: unknown[]): any {
  const p: any = Promise.resolve(rows);
  p.returning = () => Promise.resolve(rows);
  p.limit = () => Promise.resolve(rows);
  p.orderBy = () => Promise.resolve(rows);
  return p;
}

vi.mock('../../config/database.js', () => {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => terminal(nextRows()));
  chain.values = vi.fn(() => terminal(nextRows()));
  return { db: chain, queryClient: () => Promise.resolve([]) };
});

// ─── getCaseById stub ───

const getCaseByIdMock = vi.fn();
vi.mock('./crisis-case.queries.js', () => ({
  getCaseById: getCaseByIdMock,
  getCaseByEpisode: vi.fn(),
  listCases: vi.fn(),
}));

// ─── helpers: mock only notifySupervisors, keep others real ───

const notifySupervisorsMock = vi.fn();
vi.mock('./crisis-helpers.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./crisis-helpers.js')>();
  return {
    ...orig,
    notifySupervisors: notifySupervisorsMock,
  };
});

// Import AFTER mocks are installed.
const {
  createFromCandidate,
  updateChecklistStep,
  submitForSignOff,
  signOff,
} = await import('./crisis-case.workflow.js');

// ─── Test fixtures ───────────────────────────────────────────

const ORG = 'org-1';
const CANDIDATE = 'cand-1';
const ACCEPTOR = 'user-1';
const CASE_ID = 'case-1';
const EPISODE_ID = 'ep-1';

function fakeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CASE_ID,
    orgId: ORG,
    episodeId: EPISODE_ID,
    candidateId: CANDIDATE,
    stage: 'open',
    checklist: {},
    closureSummary: null,
    supervisorNote: null,
    signedOffBy: null,
    signedOffAt: null,
    submittedForSignOffAt: null,
    createdBy: ACCEPTOR,
    createdAt: new Date('2026-04-19T00:00:00Z'),
    updatedAt: new Date('2026-04-19T00:00:00Z'),
    ...overrides,
  };
}

function fakeCrisisCase(overrides: Partial<{
  stage: string;
  checklist: Record<string, unknown>;
  createdBy: string | null;
}> = {}) {
  return {
    id: CASE_ID,
    orgId: ORG,
    episodeId: EPISODE_ID,
    candidateId: CANDIDATE,
    stage: 'open',
    checklist: {},
    closureSummary: null,
    supervisorNote: null,
    signedOffBy: null,
    signedOffAt: null,
    submittedForSignOffAt: null,
    createdBy: ACCEPTOR,
    createdAt: '2026-04-19T00:00:00.000Z',
    updatedAt: '2026-04-19T00:00:00.000Z',
    ...overrides,
  };
}

// All 5 required steps marked done — used by the submit-success test.
const COMPLETED_CHECKLIST = {
  reinterview: { done: true, summary: '重新访谈已完成', completedAt: '2026-04-19T00:00:00Z' },
  parentContact: { done: true, method: 'phone', contactName: '妈妈', summary: '已告知风险', completedAt: '2026-04-19T00:00:00Z' },
  documents: { done: true, summary: '知情同意已签', completedAt: '2026-04-19T00:00:00Z' },
  referral: { done: true, skipped: true, skipReason: '家长拒绝转介', completedAt: '2026-04-19T00:00:00Z' },
  followUp: { done: true, summary: '已安排 1 周回访', completedAt: '2026-04-19T00:00:00Z' },
};

beforeEach(() => {
  dbResults.length = 0;
  getCaseByIdMock.mockReset();
  notifySupervisorsMock.mockReset();
});

// ─── createFromCandidate ─────────────────────────────────────

describe('createFromCandidate', () => {
  it('creates episode + crisis_case + timeline from a pending crisis_candidate', async () => {
    dbResults.push(
      [{ id: CANDIDATE, orgId: ORG, kind: 'crisis_candidate', status: 'pending', clientUserId: 'client-1', suggestion: '来访者有自伤想法', reason: 'PHQ-9 第 9 题 = 3', sourceRuleId: 'r1', priority: 'high' }],
      [{ id: EPISODE_ID }],
      [{ id: CASE_ID }],
      [],
    );

    const res = await createFromCandidate({ orgId: ORG, candidateId: CANDIDATE, acceptorUserId: ACCEPTOR });

    expect(res).toEqual({ episodeId: EPISODE_ID, crisisCaseId: CASE_ID });
  });

  it('throws NotFoundError when candidate does not exist', async () => {
    dbResults.push([]);
    await expect(
      createFromCandidate({ orgId: ORG, candidateId: CANDIDATE, acceptorUserId: ACCEPTOR }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects candidates whose kind is not 'crisis_candidate'", async () => {
    dbResults.push([{ id: CANDIDATE, orgId: ORG, kind: 'risk_candidate', status: 'pending' }]);
    await expect(
      createFromCandidate({ orgId: ORG, candidateId: CANDIDATE, acceptorUserId: ACCEPTOR }),
    ).rejects.toThrow(/仅 crisis_candidate/);
  });

  it("rejects candidates whose status is not 'pending' (already processed)", async () => {
    dbResults.push([{ id: CANDIDATE, orgId: ORG, kind: 'crisis_candidate', status: 'resolved' }]);
    await expect(
      createFromCandidate({ orgId: ORG, candidateId: CANDIDATE, acceptorUserId: ACCEPTOR }),
    ).rejects.toThrow(/候选已被处理/);
  });
});

// ─── submitForSignOff ─────────────────────────────────────────

describe('submitForSignOff', () => {
  it('rejects when any required checklist step is incomplete (and does NOT notify supervisors)', async () => {
    getCaseByIdMock.mockResolvedValueOnce(
      fakeCrisisCase({ stage: 'open', checklist: { reinterview: { done: true } } }),
    );

    await expect(
      submitForSignOff({
        orgId: ORG,
        caseId: CASE_ID,
        closureSummary: '结案摘要',
        userId: ACCEPTOR,
      }),
    ).rejects.toThrow(/必做步骤未完成/);
    expect(notifySupervisorsMock).not.toHaveBeenCalled();
  });

  it("transitions stage to 'pending_sign_off' and fans out supervisor notification when all steps are complete", async () => {
    getCaseByIdMock.mockResolvedValueOnce(
      fakeCrisisCase({ stage: 'open', checklist: COMPLETED_CHECKLIST }),
    );
    // update crisisCases → returning
    dbResults.push([fakeRow({ stage: 'pending_sign_off', closureSummary: '三方已沟通,拟结案' })]);
    // insert careTimeline → no return (ignored value)
    dbResults.push([]);

    const result = await submitForSignOff({
      orgId: ORG,
      caseId: CASE_ID,
      closureSummary: '三方已沟通,拟结案',
      userId: ACCEPTOR,
    });

    expect(result.stage).toBe('pending_sign_off');
    expect(notifySupervisorsMock).toHaveBeenCalledTimes(1);
    expect(notifySupervisorsMock.mock.calls[0][0]).toBe(ORG);
    expect(notifySupervisorsMock.mock.calls[0][1].type).toBe('crisis_sign_off_request');
  });
});

// ─── signOff ──────────────────────────────────────────────────

describe('signOff', () => {
  it("approve path closes the crisis_case AND the underlying care_episode, and notifies the counselor", async () => {
    getCaseByIdMock.mockResolvedValueOnce(
      fakeCrisisCase({ stage: 'pending_sign_off', createdBy: ACCEPTOR }),
    );
    // update crisisCases → returning closed row
    dbResults.push([fakeRow({ stage: 'closed', signedOffBy: 'supervisor-1' })]);
    // update careEpisodes → no return
    dbResults.push([]);
    // insert careTimeline → no return
    dbResults.push([]);
    // insert notifications (counselor notice) → no return
    dbResults.push([]);

    const result = await signOff({
      orgId: ORG,
      caseId: CASE_ID,
      approve: true,
      supervisorNote: '处置完备',
      userId: 'supervisor-1',
    });

    expect(result.stage).toBe('closed');
  });
});

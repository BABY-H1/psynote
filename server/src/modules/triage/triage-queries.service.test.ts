/**
 * Unit tests for research-triage query service.
 *
 * Mocks the db as a chainable proxy with a FIFO result queue (same pattern
 * as crisis-case.workflow.test.ts). Each terminal call (`.where().orderBy()`
 * or `.where().limit()`) pops one row set from the queue.
 *
 * Scope: the two public read functions consumed by /api/orgs/:orgId/triage:
 *   - listTriageCandidates  — master list of triageable results
 *   - listTriageBuckets     — L1-L4 + unrated count aggregation
 *
 * The source is `assessment_results` rows whose parent assessment is of
 * type 'screening'. We rely on this filter being applied inside the
 * service; the tests feed pre-joined fixture rows that a real INNER JOIN
 * would yield.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── DB mock: chainable with FIFO result queue ──────────────────

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
  p.groupBy = () => Promise.resolve(rows);
  return p;
}

vi.mock('../../config/database.js', () => {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => terminal(nextRows()));
  return { db: chain };
});

// Import after mocks
const { listTriageCandidates, listTriageBuckets, listCandidatesForService } = await import('./triage-queries.service.js');

beforeEach(() => {
  dbResults.length = 0;
});

// ─── listTriageCandidates ────────────────────────────────────────

describe('listTriageCandidates', () => {
  it('returns rows joined with assessments, mapping each to the view-model shape', async () => {
    dbResults.push([
      {
        resultId: 'r1',
        userId: 'u1',
        userName: '张三',
        assessmentId: 'a1',
        assessmentTitle: 'PHQ-9 心理筛查',
        assessmentType: 'screening',
        riskLevel: 'level_3',
        totalScore: '19',
        batchId: 'b1',
        createdAt: new Date('2026-04-20T00:00:00Z'),
        candidateId: null,
        candidateStatus: null,
        candidateKind: null,
        suggestion: null,
        priority: null,
        latestEpisodeId: null,
      },
    ]);

    const rows = await listTriageCandidates('org-1', {});
    expect(rows).toHaveLength(1);
    expect(rows[0].resultId).toBe('r1');
    expect(rows[0].riskLevel).toBe('level_3');
    expect(rows[0].assessmentType).toBe('screening');
  });

  it('surfaces the candidate linkage when the rule engine already produced one for a screening result', async () => {
    dbResults.push([
      {
        resultId: 'r10',
        userId: 'u10',
        userName: '李四',
        assessmentId: 'a2',
        assessmentTitle: 'PHQ-9 常规筛查',
        assessmentType: 'screening',
        riskLevel: 'level_3',
        totalScore: '19',
        batchId: null,
        createdAt: new Date(),
        candidateId: 'c1',
        candidateStatus: 'pending',
        candidateKind: 'episode_candidate',
        suggestion: '建议建个案',
        priority: 'normal',
        latestEpisodeId: null,
      },
    ]);
    const rows = await listTriageCandidates('org-1', {});
    expect(rows[0].assessmentType).toBe('screening');
    expect(rows[0].candidateKind).toBe('episode_candidate');
    expect(rows[0].candidateId).toBe('c1');
  });

  it('accepts optional batchId filter without error', async () => {
    dbResults.push([]);
    const rows = await listTriageCandidates('org-1', { batchId: 'b1' });
    expect(rows).toEqual([]);
  });

  it('accepts optional level filter without error', async () => {
    dbResults.push([
      {
        resultId: 'r2',
        riskLevel: 'level_4',
        userId: 'u2',
        userName: '王五',
        assessmentId: 'a1',
        assessmentTitle: 'PHQ-9',
        assessmentType: 'screening',
        totalScore: '24',
        batchId: null,
        createdAt: new Date(),
        candidateId: null,
        candidateStatus: null,
        candidateKind: null,
        suggestion: null,
        priority: null,
        latestEpisodeId: null,
      },
    ]);
    const rows = await listTriageCandidates('org-1', { level: 'level_4' });
    expect(rows.every((r) => r.riskLevel === 'level_4')).toBe(true);
  });

  it('respects data scope (assigned): returns empty when allowedClientIds is []', async () => {
    dbResults.push([]);
    const rows = await listTriageCandidates('org-1', {
      scope: { type: 'assigned', allowedClientIds: [] },
    });
    expect(rows).toEqual([]);
  });

  it('tags screening rows with source="screening"', async () => {
    dbResults.push([
      {
        resultId: 'r3',
        userId: 'u3',
        userName: '孙八',
        assessmentId: 'a1',
        assessmentTitle: 'PHQ-9',
        assessmentType: 'screening',
        riskLevel: 'level_1',
        totalScore: '3',
        batchId: null,
        createdAt: new Date(),
        candidateId: null,
        candidateStatus: null,
        candidateKind: null,
        suggestion: null,
        priority: null,
        latestEpisodeId: null,
      },
    ]);
    const rows = await listTriageCandidates('org-1', { mode: 'screening' });
    expect(rows[0].source).toBe('screening');
  });
});

describe('listTriageCandidates — mode=manual', () => {
  it('returns candidates with sourceRuleId IS NULL, tagged source="manual"', async () => {
    dbResults.push([
      {
        candidateId: 'c5',
        userId: 'u5',
        userName: '周九',
        kind: 'crisis_candidate',
        suggestion: '咨询师手工添加的研判对象',
        priority: 'high',
        status: 'pending',
        createdAt: new Date('2026-04-22T00:00:00Z'),
      },
    ]);

    const rows = await listTriageCandidates('org-1', { mode: 'manual' });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('manual');
    expect(rows[0].candidateId).toBe('c5');
    expect(rows[0].resultId).toBeNull();
  });
});

describe('listTriageCandidates — mode=all', () => {
  it('unions screening + manual, newest first', async () => {
    // first call = screening branch
    dbResults.push([
      {
        resultId: 'r100',
        userId: 'u100',
        userName: '吴十',
        assessmentId: 'a1',
        assessmentTitle: 'PHQ-9',
        assessmentType: 'screening',
        riskLevel: 'level_2',
        totalScore: '9',
        batchId: null,
        createdAt: new Date('2026-04-15T00:00:00Z'),
        candidateId: null,
        candidateStatus: null,
        candidateKind: null,
        suggestion: null,
        priority: null,
        latestEpisodeId: null,
      },
    ]);
    // second call = manual branch
    dbResults.push([
      {
        candidateId: 'c200',
        userId: 'u200',
        userName: '郑十一',
        kind: 'crisis_candidate',
        suggestion: '手工',
        priority: 'urgent',
        status: 'pending',
        createdAt: new Date('2026-04-22T00:00:00Z'),
      },
    ]);

    const rows = await listTriageCandidates('org-1', { mode: 'all' });
    expect(rows).toHaveLength(2);
    // Newest (manual, 2026-04-22) should sort first
    expect(rows[0].source).toBe('manual');
    expect(rows[1].source).toBe('screening');
  });
});

// ─── listTriageBuckets ───────────────────────────────────────────

describe('listTriageBuckets', () => {
  it('returns counts per risk level plus unrated', async () => {
    dbResults.push([
      { riskLevel: 'level_1', count: 42 },
      { riskLevel: 'level_2', count: 18 },
      { riskLevel: 'level_3', count: 7 },
      { riskLevel: 'level_4', count: 2 },
      { riskLevel: null, count: 5 },
    ]);

    const buckets = await listTriageBuckets('org-1', {});
    expect(buckets.level_1).toBe(42);
    expect(buckets.level_2).toBe(18);
    expect(buckets.level_3).toBe(7);
    expect(buckets.level_4).toBe(2);
    expect(buckets.unrated).toBe(5);
  });

  it('fills missing levels with zero', async () => {
    dbResults.push([{ riskLevel: 'level_4', count: 3 }]);
    const buckets = await listTriageBuckets('org-1', {});
    expect(buckets.level_1).toBe(0);
    expect(buckets.level_2).toBe(0);
    expect(buckets.level_3).toBe(0);
    expect(buckets.level_4).toBe(3);
    expect(buckets.unrated).toBe(0);
  });
});

// ─── listCandidatesForService ────────────────────────────────────

describe('listCandidatesForService', () => {
  it('returns candidates targeted at a group instance, mapped to view model', async () => {
    dbResults.push([
      {
        candidateId: 'cand-1',
        kind: 'group_candidate',
        userId: 'user-1',
        userName: '赵六',
        suggestion: '建议加入 CBT 团辅',
        reason: '入组评估命中 L2 规则',
        priority: 'normal',
        status: 'pending',
        sourceResultId: 'r-1',
        sourceRuleId: 'rule-1',
        createdAt: new Date('2026-04-22T00:00:00Z'),
      },
    ]);

    const rows = await listCandidatesForService({
      orgId: 'org-1',
      serviceType: 'group',
      instanceId: 'gi-1',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].candidateId).toBe('cand-1');
    expect(rows[0].kind).toBe('group_candidate');
    expect(rows[0].userName).toBe('赵六');
  });

  it('defaults to status=pending when not specified', async () => {
    dbResults.push([]);
    const rows = await listCandidatesForService({
      orgId: 'org-1',
      serviceType: 'course',
      instanceId: 'ci-1',
    });
    expect(rows).toEqual([]);
  });

  it('honours explicit status filter (e.g. accepted)', async () => {
    dbResults.push([
      {
        candidateId: 'cand-2',
        kind: 'course_candidate',
        userId: 'user-2',
        userName: '钱七',
        suggestion: '建议推《情绪管理》课程',
        reason: null,
        priority: 'low',
        status: 'accepted',
        sourceResultId: null,
        sourceRuleId: 'rule-9',
        createdAt: new Date(),
      },
    ]);
    const rows = await listCandidatesForService({
      orgId: 'org-1',
      serviceType: 'course',
      instanceId: 'ci-1',
      status: 'accepted',
    });
    expect(rows[0].status).toBe('accepted');
  });
});

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
  // Phase H: insert chain for lazyCreateCandidate. db.insert(t).values(v).returning()
  // pops one row set from the same FIFO queue, so tests can interleave selects + insert.
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve(nextRows()));
  return { db: chain };
});

// Import after mocks
const {
  listTriageCandidates, listTriageBuckets, listCandidatesForService,
  lazyCreateCandidate,
} = await import('./triage-queries.service.js');

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

  it('Phase J: 暴露 resolvedRefType + resolvedRefId 让 detail panel 能 inline 渲染危机清单', async () => {
    dbResults.push([
      {
        resultId: 'r11',
        userId: 'u11',
        userName: '张三',
        assessmentId: 'a1',
        assessmentTitle: 'PHQ-9',
        assessmentType: 'screening',
        riskLevel: 'level_4',
        totalScore: '24',
        batchId: null,
        createdAt: new Date(),
        candidateId: 'c-crisis',
        candidateStatus: 'accepted',
        candidateKind: 'crisis_candidate',
        suggestion: '危机',
        priority: 'urgent',
        latestEpisodeId: null,
        resolvedRefType: 'care_episode',
        resolvedRefId: 'ep-c1',
      },
    ]);
    const rows = await listTriageCandidates('org-1', {});
    expect(rows[0].resolvedRefType).toBe('care_episode');
    expect(rows[0].resolvedRefId).toBe('ep-c1');
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

// ─── lazyCreateCandidate (Phase H — BUG-007 真正修复) ────────────
//
// 研判分流详情面板的"转个案 / 课程·团辅 / 忽略"按钮在没有规则引擎产
// 生 candidate_pool 行的机构里永远 disabled. 这里加 lazy create:
// 用户点按钮时, 前端先 POST 这个端点把 result 转为 candidate_pool 行,
// 再走原 accept/dismiss 流程. 中间步骤对用户不可见.
//
// 调用顺序 (FIFO 队列模拟):
//   1) SELECT assessment_results WHERE id=:resultId AND orgId=:orgId LIMIT 1
//      → 用来拿 clientUserId / riskLevel 并校验跨 org
//   2) SELECT candidate_pool WHERE sourceResultId=:resultId AND kind=:kind
//      AND status='pending' LIMIT 1 → 防重复
//   3a) 命中: 返回该行, 不 INSERT
//   3b) 未命中: INSERT candidate_pool ... RETURNING * → 返回新行

describe('lazyCreateCandidate', () => {
  it('为 L3 result 创建 episode_candidate, sourceRuleId=null, status=pending, priority=normal', async () => {
    // 1) result lookup
    dbResults.push([
      { id: 'r-1', orgId: 'org-1', userId: 'u-1', riskLevel: 'level_3', assessmentId: 'a-1' },
    ]);
    // 2) idempotency check — no existing candidate
    dbResults.push([]);
    // 3) insert returning
    dbResults.push([
      {
        id: 'c-new',
        orgId: 'org-1',
        clientUserId: 'u-1',
        kind: 'episode_candidate',
        suggestion: '研判分流人工创建',
        reason: '研判分流人工创建 · 风险 level_3',
        priority: 'normal',
        sourceRuleId: null,
        sourceResultId: 'r-1',
        status: 'pending',
        createdAt: new Date(),
      },
    ]);

    const row = await lazyCreateCandidate({
      orgId: 'org-1',
      resultId: 'r-1',
      kind: 'episode_candidate',
    });

    expect(row.id).toBe('c-new');
    expect(row.kind).toBe('episode_candidate');
    expect(row.priority).toBe('normal');
    expect(row.sourceRuleId).toBeNull();
    expect(row.sourceResultId).toBe('r-1');
    expect(row.status).toBe('pending');
  });

  it('L4 result 默认 priority=urgent', async () => {
    dbResults.push([
      { id: 'r-2', orgId: 'org-1', userId: 'u-2', riskLevel: 'level_4', assessmentId: 'a-1' },
    ]);
    dbResults.push([]); // no existing
    dbResults.push([
      {
        id: 'c-urgent',
        priority: 'urgent',
        kind: 'crisis_candidate',
        sourceRuleId: null,
        sourceResultId: 'r-2',
        status: 'pending',
      },
    ]);

    const row = await lazyCreateCandidate({
      orgId: 'org-1',
      resultId: 'r-2',
      kind: 'crisis_candidate',
    });

    expect(row.priority).toBe('urgent');
  });

  it('idempotent: 同 (resultId, kind) 已有 pending 候选 → 返回原行, 不 INSERT', async () => {
    dbResults.push([
      { id: 'r-3', orgId: 'org-1', userId: 'u-3', riskLevel: 'level_2', assessmentId: 'a-1' },
    ]);
    // 2) existing candidate found
    dbResults.push([
      {
        id: 'c-existing',
        orgId: 'org-1',
        clientUserId: 'u-3',
        kind: 'group_candidate',
        priority: 'normal',
        sourceRuleId: null,
        sourceResultId: 'r-3',
        status: 'pending',
        createdAt: new Date('2026-04-20T00:00:00Z'),
      },
    ]);
    // No 3rd push — INSERT must not be called

    const row = await lazyCreateCandidate({
      orgId: 'org-1',
      resultId: 'r-3',
      kind: 'group_candidate',
    });

    expect(row.id).toBe('c-existing');
    // FIFO 队列里 (idempotent 路径不应 pop 第三次), 还剩 0
    expect(dbResults.length).toBe(0);
  });

  it('result 不存在 → throw NotFoundError', async () => {
    dbResults.push([]); // SELECT returns nothing
    await expect(
      lazyCreateCandidate({ orgId: 'org-1', resultId: 'r-missing', kind: 'episode_candidate' }),
    ).rejects.toThrow();
  });

  it('result 跨 org → 视为不存在 (NotFoundError, 不泄漏存在性)', async () => {
    // 实现层在 SELECT 时同时 WHERE orgId=:orgId, 跨 org 的 result 返回空 → NotFoundError
    dbResults.push([]);
    await expect(
      lazyCreateCandidate({ orgId: 'org-other', resultId: 'r-1', kind: 'episode_candidate' }),
    ).rejects.toThrow();
  });

  it('显式传 priority 优先于 risk-level 默认值', async () => {
    dbResults.push([
      { id: 'r-5', orgId: 'org-1', userId: 'u-5', riskLevel: 'level_1', assessmentId: 'a-1' },
    ]);
    dbResults.push([]);
    dbResults.push([
      { id: 'c-explicit', priority: 'urgent', kind: 'episode_candidate', sourceRuleId: null, sourceResultId: 'r-5', status: 'pending' },
    ]);

    const row = await lazyCreateCandidate({
      orgId: 'org-1',
      resultId: 'r-5',
      kind: 'episode_candidate',
      priority: 'urgent',
    });

    expect(row.priority).toBe('urgent');
  });
});


import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * dataScopeGuard mixes pure role-branching logic with drizzle queries for the
 * counselor path. We mock ../config/database.js to control query results, then
 * feed the guard synthetic request objects.
 */

// Queue of rows to return for consecutive db.select(...).from(...).where(...) calls.
const selectQueue: unknown[][] = [];

vi.mock('../config/database.js', () => {
  const chain = {
    select: vi.fn(() => chain),
    from: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(selectQueue.shift() ?? [])),
  };
  return {
    db: chain,
    queryClient: vi.fn(),
  };
});

// Import AFTER mock so the mocked db is bound.
const { dataScopeGuard } = await import('./data-scope.js');

const reply = {} as FastifyReply;

interface FakeOrg {
  orgId: string;
  role: 'org_admin' | 'counselor' | 'client';
  orgType: 'counseling' | 'enterprise' | 'school' | 'solo' | 'hospital';
  fullPracticeAccess?: boolean;
  superviseeUserIds?: string[];
}

function reqFor(args: {
  userId: string;
  isSystemAdmin?: boolean;
  org?: FakeOrg;
}): FastifyRequest {
  return {
    user: { id: args.userId, email: 'x@x', isSystemAdmin: args.isSystemAdmin ?? false },
    org: args.org
      ? {
          ...args.org,
          memberId: 'm1',
          supervisorId: null,
          fullPracticeAccess: args.org.fullPracticeAccess ?? false,
          superviseeUserIds: args.org.superviseeUserIds ?? [],
          tier: 'growth' as const,
          license: { status: 'active' as const, maxSeats: 10, expiresAt: null },
        }
      : undefined,
  } as unknown as FastifyRequest;
}

describe('dataScopeGuard', () => {
  beforeEach(() => {
    selectQueue.length = 0;
  });

  it('no org context → returns early, scope undefined', async () => {
    const r = reqFor({ userId: 'u1' });
    await dataScopeGuard(r, reply);
    expect(r.dataScope).toBeUndefined();
  });

  it("enterprise org_admin → scope='aggregate_only' (EAP 合规核心)", async () => {
    const r = reqFor({
      userId: 'u1',
      org: { orgId: 'o1', role: 'org_admin', orgType: 'enterprise' },
    });
    await dataScopeGuard(r, reply);
    expect(r.dataScope).toEqual({ type: 'aggregate_only' });
  });

  it("counseling org_admin → scope='all'", async () => {
    const r = reqFor({
      userId: 'u1',
      org: { orgId: 'o1', role: 'org_admin', orgType: 'counseling' },
    });
    await dataScopeGuard(r, reply);
    expect(r.dataScope).toEqual({ type: 'all' });
  });

  it("school org_admin → scope='all'", async () => {
    const r = reqFor({
      userId: 'u1',
      org: { orgId: 'o1', role: 'org_admin', orgType: 'school' },
    });
    await dataScopeGuard(r, reply);
    expect(r.dataScope).toEqual({ type: 'all' });
  });

  it("system_admin always → scope='all'", async () => {
    const r = reqFor({
      userId: 'sys',
      isSystemAdmin: true,
      org: { orgId: 'o1', role: 'counselor', orgType: 'counseling' },
    });
    await dataScopeGuard(r, reply);
    expect(r.dataScope).toEqual({ type: 'all' });
  });

  it("counselor with fullPracticeAccess → scope='all'", async () => {
    const r = reqFor({
      userId: 'u1',
      org: { orgId: 'o1', role: 'counselor', orgType: 'counseling', fullPracticeAccess: true },
    });
    await dataScopeGuard(r, reply);
    expect(r.dataScope).toEqual({ type: 'all' });
  });

  it("counselor with own assignments → scope='assigned' with those client IDs", async () => {
    // 3 consecutive db calls: own assignments, grants, supervisees
    selectQueue.push([{ clientId: 'c1' }, { clientId: 'c2' }]); // ownAssignments
    selectQueue.push([]); // grants
    selectQueue.push([]); // superviseeClients

    const r = reqFor({
      userId: 'u1',
      org: { orgId: 'o1', role: 'counselor', orgType: 'counseling' },
    });
    await dataScopeGuard(r, reply);
    expect(r.dataScope?.type).toBe('assigned');
    expect(r.dataScope?.allowedClientIds).toEqual(expect.arrayContaining(['c1', 'c2']));
    expect(r.dataScope?.allowedClientIds).toHaveLength(2);
  });

  it('counselor: union of own + grants + supervisees is deduplicated', async () => {
    selectQueue.push([{ clientId: 'c1' }]); // own
    selectQueue.push([{ clientId: 'c2' }, { clientId: 'c1' }]); // grants (dup c1)
    selectQueue.push([{ clientId: 'c3' }, { clientId: 'c2' }]); // supervisees (dup c2)

    const r = reqFor({
      userId: 'u1',
      org: {
        orgId: 'o1',
        role: 'counselor',
        orgType: 'counseling',
        superviseeUserIds: ['u2'],
      },
    });
    await dataScopeGuard(r, reply);
    expect(r.dataScope?.type).toBe('assigned');
    expect(r.dataScope?.allowedClientIds?.sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it("counselor with no clients at all → scope='assigned' with empty allowedClientIds", async () => {
    selectQueue.push([]); // own
    selectQueue.push([]); // grants
    selectQueue.push([]); // supervisees

    const r = reqFor({
      userId: 'u1',
      org: { orgId: 'o1', role: 'counselor', orgType: 'counseling' },
    });
    await dataScopeGuard(r, reply);
    expect(r.dataScope).toEqual({ type: 'assigned', allowedClientIds: [] });
  });

  it("client role → scope='none'", async () => {
    const r = reqFor({
      userId: 'u1',
      org: { orgId: 'o1', role: 'client', orgType: 'counseling' },
    });
    await dataScopeGuard(r, reply);
    expect(r.dataScope).toEqual({ type: 'none' });
  });
});

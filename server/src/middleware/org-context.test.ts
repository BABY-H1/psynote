import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';

/**
 * orgContextGuard tests — mock database + queryClient + verifyLicense.
 * We focus on the branching (membership check / system admin bypass /
 * dev-mode x-dev-role / orgType resolution) rather than SQL correctness.
 */

// Mutable env state so individual tests can flip NODE_ENV to 'development'
// to exercise the x-dev-role bypass branch. env.ts is normally a frozen zod
// result, so we replace the whole module export with a live object.
const envState = {
  NODE_ENV: 'test' as 'test' | 'development' | 'production',
  JWT_SECRET: 'test-jwt-secret-please-change',
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  PORT: 4000,
  HOST: '0.0.0.0',
  CLIENT_URL: 'http://localhost:5173',
  AI_BASE_URL: 'https://api.openai.com/v1',
  AI_MODEL: 'gpt-4o',
};
vi.mock('../config/env.js', () => ({ env: envState }));

const selectQueue: unknown[][] = [];
const queryClientCalls: unknown[][] = [];

function takeNext() {
  const rows = selectQueue.shift() ?? [];
  // Drizzle queries are thenable AND chainable (`.limit(1)`).
  // We return an object that behaves as both: a Promise resolving to rows,
  // with a `limit` method resolving to the same rows (no second shift).
  const p = Promise.resolve(rows) as Promise<unknown[]> & { limit: () => Promise<unknown[]> };
  p.limit = () => Promise.resolve(rows);
  return p;
}

vi.mock('../config/database.js', () => {
  const chain = {
    select: vi.fn(() => chain),
    from: vi.fn(() => chain),
    where: vi.fn(() => takeNext()),
  };
  return {
    db: chain,
    queryClient: (strings: TemplateStringsArray, ...values: unknown[]) => {
      queryClientCalls.push([Array.from(strings), ...values]);
      return Promise.resolve([]);
    },
  };
});

vi.mock('../lib/license/verify.js', () => ({
  verifyLicense: vi.fn(async () => ({ valid: false, status: 'invalid' as const })),
}));

const { orgContextGuard } = await import('./org-context.js');

const reply = {} as FastifyReply;

function reqFor(args: {
  userId?: string;
  isSystemAdmin?: boolean;
  orgId?: string;
  devRole?: string;
}): FastifyRequest {
  return {
    user: args.userId
      ? { id: args.userId, email: 'x@x', isSystemAdmin: args.isSystemAdmin ?? false }
      : undefined,
    params: args.orgId ? { orgId: args.orgId } : {},
    headers: args.devRole ? { 'x-dev-role': args.devRole } : {},
  } as unknown as FastifyRequest;
}

describe('orgContextGuard', () => {
  beforeEach(() => {
    selectQueue.length = 0;
    queryClientCalls.length = 0;
  });

  it('throws NotFoundError when :orgId param is missing', async () => {
    const r = reqFor({ userId: 'u1' });
    await expect(orgContextGuard(r, reply)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when user is not authenticated', async () => {
    const r = reqFor({ orgId: '00000000-0000-0000-0000-000000000001' });
    await expect(orgContextGuard(r, reply)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('system_admin bypasses membership: sets role=org_admin and full access', async () => {
    // single query: organizations row (plan + licenseKey + settings)
    selectQueue.push([{ plan: 'premium', licenseKey: null, settings: { orgType: 'school' } }]);

    const r = reqFor({ userId: 'sys1', isSystemAdmin: true, orgId: '00000000-0000-0000-0000-000000000001' });
    await orgContextGuard(r, reply);

    expect(r.org).toMatchObject({
      orgId: '00000000-0000-0000-0000-000000000001',
      role: 'org_admin',
      memberId: 'system-admin',
      fullPracticeAccess: true,
      orgType: 'school',
    });
    // system_admin path still sets RLS GUCs
    expect(queryClientCalls.length).toBe(2);
  });

  it('rejects non-member user in production-style flow (NODE_ENV=test, no dev bypass)', async () => {
    envState.NODE_ENV = 'production';

    selectQueue.push([]); // orgMembers lookup → empty

    const r = reqFor({ userId: 'u1', orgId: '00000000-0000-0000-0000-000000000001' });
    await expect(orgContextGuard(r, reply)).rejects.toBeInstanceOf(ForbiddenError);

    envState.NODE_ENV = 'test';
  });

  it('valid member with plan=pro + orgType=counseling gets tier=growth', async () => {
    envState.NODE_ENV = 'production';

    // 1. orgMembers lookup → active member (non-counselor so no supervisees query)
    selectQueue.push([
      {
        id: 'm1',
        orgId: '00000000-0000-0000-0000-000000000001',
        userId: 'u1',
        role: 'org_admin',
        status: 'active',
        validUntil: null,
        supervisorId: null,
        fullPracticeAccess: true,
      },
    ]);
    // 2. supervisees (org_admin does load supervisees per implementation)
    selectQueue.push([]);
    // 3. organizations row
    selectQueue.push([{ plan: 'pro', licenseKey: null, settings: { orgType: 'counseling' } }]);

    const r = reqFor({ userId: 'u1', orgId: '00000000-0000-0000-0000-000000000001' });
    await orgContextGuard(r, reply);

    expect(r.org).toMatchObject({
      orgId: '00000000-0000-0000-0000-000000000001',
      role: 'org_admin',
      memberId: 'm1',
      tier: 'growth',
      orgType: 'counseling',
      fullPracticeAccess: true,
    });

    envState.NODE_ENV = 'test';
  });

  it('rejects when membership has expired (validUntil in the past)', async () => {
    envState.NODE_ENV = 'production';

    const yesterday = new Date(Date.now() - 86400_000).toISOString();
    selectQueue.push([
      {
        id: 'm1',
        orgId: '00000000-0000-0000-0000-000000000001',
        userId: 'u1',
        role: 'counselor',
        status: 'active',
        validUntil: yesterday,
        supervisorId: null,
        fullPracticeAccess: false,
      },
    ]);

    const r = reqFor({ userId: 'u1', orgId: '00000000-0000-0000-0000-000000000001' });
    await expect(orgContextGuard(r, reply)).rejects.toBeInstanceOf(ForbiddenError);

    envState.NODE_ENV = 'test';
  });

  // ─── x-dev-role backdoor has been REMOVED (security fix) ───
  // Pre-launch audit found the dev-mode bypass at org-context.ts:134-157
  // silently let non-members through in NODE_ENV=development. Nothing on
  // the client side ever sent the header, so removing it is zero-impact
  // on real dev workflows but closes a tenant-isolation hole that would
  // have shipped to any deployment accidentally booted with NODE_ENV
  // !== 'production' (e.g. staging, CI pre-prod).

  it('NODE_ENV=development + non-member is REJECTED (x-dev-role bypass removed)', async () => {
    envState.NODE_ENV = 'development';

    selectQueue.push([]); // orgMembers → empty

    const r = reqFor({ userId: 'u1', orgId: '00000000-0000-0000-0000-000000000001', devRole: 'counselor' });
    await expect(orgContextGuard(r, reply)).rejects.toBeInstanceOf(ForbiddenError);

    envState.NODE_ENV = 'test';
  });

  it("NODE_ENV=development + x-dev-role='org_admin' still REJECTED (no privilege escalation)", async () => {
    envState.NODE_ENV = 'development';

    selectQueue.push([]);

    const r = reqFor({ userId: 'u1', orgId: '00000000-0000-0000-0000-000000000001', devRole: 'org_admin' });
    await expect(orgContextGuard(r, reply)).rejects.toBeInstanceOf(ForbiddenError);

    envState.NODE_ENV = 'test';
  });

  it('orgType falls back to counseling when settings.orgType is missing (real member path)', async () => {
    envState.NODE_ENV = 'production';

    // orgMembers → active member
    selectQueue.push([
      { id: 'm1', orgId: '00000000-0000-0000-0000-000000000001', userId: 'u1', role: 'counselor', status: 'active', validUntil: null, supervisorId: null, fullPracticeAccess: false },
    ]);
    // supervisees (counselor path loads them)
    selectQueue.push([]);
    // organizations with empty settings
    selectQueue.push([{ plan: 'free', licenseKey: null, settings: {} }]);

    const r = reqFor({ userId: 'u1', orgId: '00000000-0000-0000-0000-000000000001' });
    await orgContextGuard(r, reply);

    expect(r.org?.orgType).toBe('counseling');

    envState.NODE_ENV = 'test';
  });
});

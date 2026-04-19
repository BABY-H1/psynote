import { describe, it, expect } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  requireRole,
  requireClientAccess,
} from './rbac.js';
import { ForbiddenError } from '../lib/errors.js';

/**
 * rbac.ts tests — all pure, no Fastify instance, no DB.
 * We feed factory-produced preHandlers plain request objects shaped like FastifyRequest.
 */

// ─── test helpers ──────────────────────────────────────────────

interface FakeReq {
  user?: { id: string; email: string; isSystemAdmin: boolean };
  org?: { role: 'org_admin' | 'counselor' | 'client' };
  dataScope?: {
    type: 'all' | 'assigned' | 'aggregate_only' | 'none';
    allowedClientIds?: string[];
  };
  params?: Record<string, string>;
}

const req = (partial: FakeReq): FastifyRequest => partial as unknown as FastifyRequest;
const reply = {} as FastifyReply;

// ─── requireRole ─────────────────────────────────────────────────

describe('requireRole', () => {
  it('passes when user has an allowed role', async () => {
    const guard = requireRole('org_admin');
    await expect(
      guard(req({ user: { id: 'u1', email: 'a@x', isSystemAdmin: false }, org: { role: 'org_admin' } }), reply),
    ).resolves.toBeUndefined();
  });

  it('rejects counselor on an org_admin-only route', async () => {
    const guard = requireRole('org_admin');
    await expect(
      guard(req({ user: { id: 'u1', email: 'a@x', isSystemAdmin: false }, org: { role: 'counselor' } }), reply),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('system_admin bypasses role check', async () => {
    const guard = requireRole('org_admin');
    await expect(
      guard(req({ user: { id: 's1', email: 'sys@x', isSystemAdmin: true }, org: { role: 'counselor' } }), reply),
    ).resolves.toBeUndefined();
  });

  it('rejects when request.org is missing entirely', async () => {
    const guard = requireRole('org_admin');
    await expect(
      guard(req({ user: { id: 'u1', email: 'a@x', isSystemAdmin: false } }), reply),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('accepts any listed role (multi-role gate)', async () => {
    const guard = requireRole('org_admin', 'counselor');
    await expect(
      guard(req({ user: { id: 'u1', email: 'a@x', isSystemAdmin: false }, org: { role: 'counselor' } }), reply),
    ).resolves.toBeUndefined();
    // client role is not in the allowlist → rejected
    await expect(
      guard(req({ user: { id: 'u1', email: 'a@x', isSystemAdmin: false }, org: { role: 'client' } }), reply),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ─── requireClientAccess ─────────────────────────────────────────

describe('requireClientAccess', () => {
  const extractId = (r: FastifyRequest) => (r.params as { clientId: string }).clientId;

  it("scope='all' → passes", async () => {
    const guard = requireClientAccess(extractId);
    await expect(
      guard(
        req({
          user: { id: 'u1', email: 'a@x', isSystemAdmin: false },
          dataScope: { type: 'all' },
          params: { clientId: 'c1' },
        }),
        reply,
      ),
    ).resolves.toBeUndefined();
  });

  it("scope='none' → rejects", async () => {
    const guard = requireClientAccess(extractId);
    await expect(
      guard(
        req({
          user: { id: 'u1', email: 'a@x', isSystemAdmin: false },
          dataScope: { type: 'none' },
          params: { clientId: 'c1' },
        }),
        reply,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("scope='assigned' + clientId in allowedClientIds → passes", async () => {
    const guard = requireClientAccess(extractId);
    await expect(
      guard(
        req({
          user: { id: 'u1', email: 'a@x', isSystemAdmin: false },
          dataScope: { type: 'assigned', allowedClientIds: ['c1', 'c2'] },
          params: { clientId: 'c1' },
        }),
        reply,
      ),
    ).resolves.toBeUndefined();
  });

  it("scope='assigned' + clientId NOT in allowedClientIds → rejects", async () => {
    const guard = requireClientAccess(extractId);
    await expect(
      guard(
        req({
          user: { id: 'u1', email: 'a@x', isSystemAdmin: false },
          dataScope: { type: 'assigned', allowedClientIds: ['c2', 'c3'] },
          params: { clientId: 'c1' },
        }),
        reply,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when dataScope unresolved', async () => {
    const guard = requireClientAccess(extractId);
    await expect(
      guard(
        req({ user: { id: 'u1', email: 'a@x', isSystemAdmin: false }, params: { clientId: 'c1' } }),
        reply,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('system_admin bypasses all scope checks', async () => {
    const guard = requireClientAccess(extractId);
    await expect(
      guard(
        req({
          user: { id: 's1', email: 'sys@x', isSystemAdmin: true },
          dataScope: { type: 'none' },
          params: { clientId: 'c1' },
        }),
        reply,
      ),
    ).resolves.toBeUndefined();
  });
});

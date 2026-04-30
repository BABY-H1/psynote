import { describe, it, expect } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { requireAction } from './authorize.js';
import { ForbiddenError } from '../lib/errors.js';
import type { RoleV2, DataClass } from '@psynote/shared';

/**
 * authorize.ts middleware — purely in-memory, no Fastify instance, no DB.
 * Feeds factory preHandlers plain request objects shaped like FastifyRequest.
 *
 * Invariant:本中间件不替代 requireRole,只在其后叠加;与 dataScope 解耦,
 * 决策函数 authorize() 来自 @psynote/shared。
 */

const reply = {} as FastifyReply;

interface FakeOrg {
  orgId: string;
  role: 'org_admin' | 'counselor' | 'client';
  roleV2?: RoleV2;
  memberId: string;
  supervisorId: string | null;
  fullPracticeAccess: boolean;
  superviseeUserIds: string[];
  orgType: 'school' | 'counseling' | 'enterprise' | 'solo' | 'hospital';
  principalClass?: 'staff' | 'subject' | 'proxy';
  allowedDataClasses?: readonly DataClass[];
  tier: 'starter';
  license: { status: 'none'; maxSeats: null; expiresAt: null };
  isSupervisor?: boolean;
}

function makeReq(overrides: {
  user?: { id: string; email?: string; isSystemAdmin?: boolean };
  org?: Partial<FakeOrg>;
  dataScope?: { type: string; allowedClientIds?: string[] };
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}): FastifyRequest {
  const defaultUser = { id: 'u-counselor', email: 'c@x', isSystemAdmin: false };
  const defaultOrg: FakeOrg = {
    orgId: 'org-1',
    role: 'counselor',
    roleV2: 'counselor',
    memberId: 'm-1',
    supervisorId: null,
    fullPracticeAccess: false,
    superviseeUserIds: [],
    orgType: 'counseling',
    principalClass: 'staff',
    allowedDataClasses: ['phi_full', 'phi_summary', 'de_identified', 'aggregate'],
    tier: 'starter',
    license: { status: 'none', maxSeats: null, expiresAt: null },
    isSupervisor: false,
  };
  return {
    user: overrides.user ?? defaultUser,
    org: { ...defaultOrg, ...(overrides.org ?? {}) },
    dataScope: overrides.dataScope,
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body,
  } as unknown as FastifyRequest;
}

describe('requireAction — Role × Action gate', () => {
  it('counselor 被 manage_license 挡住', async () => {
    const guard = requireAction('manage_license', {
      type: 'org_license',
      dataClass: 'aggregate',
    });
    await expect(guard(makeReq({}), reply)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('clinic_admin 可以 manage_license', async () => {
    const guard = requireAction('manage_license', {
      type: 'org_license',
      dataClass: 'aggregate',
    });
    await expect(
      guard(
        makeReq({ org: { role: 'org_admin', roleV2: 'clinic_admin' } }),
        reply,
      ),
    ).resolves.toBeUndefined();
  });

  it('clinic_admin 无法 view phi_full(密级被拒,Phase 1.5 严格合规默认)', async () => {
    const guard = requireAction('view', {
      type: 'session_note',
      dataClass: 'phi_full',
      extractOwnerUserId: (r) => (r.params as { clientId: string }).clientId,
    });
    await expect(
      guard(
        makeReq({
          org: {
            role: 'org_admin',
            roleV2: 'clinic_admin',
            // 模拟 org-context.ts 真实运行: clinic_admin 默认策略不含 phi_full
            allowedDataClasses: ['phi_summary', 'de_identified', 'aggregate'],
          },
          params: { clientId: 'c-1' },
          dataScope: { type: 'all' },
        }),
        reply,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('clinic_admin + access_profile patch 可以 view phi_full', async () => {
    const guard = requireAction('view', {
      type: 'session_note',
      dataClass: 'phi_full',
      extractOwnerUserId: (r) => (r.params as { clientId: string }).clientId,
    });
    await expect(
      guard(
        makeReq({
          org: {
            role: 'org_admin',
            roleV2: 'clinic_admin',
            // 单点开通: access_profile.dataClasses 把 phi_full 加进来
            allowedDataClasses: ['phi_full', 'phi_summary', 'de_identified', 'aggregate'],
          },
          params: { clientId: 'c-1' },
          dataScope: { type: 'all' },
        }),
        reply,
      ),
    ).resolves.toBeUndefined();
  });

  it('counselor 可以 view phi_full(自己客户 + 密级允许)', async () => {
    const guard = requireAction('view', {
      type: 'session_note',
      dataClass: 'phi_full',
      extractOwnerUserId: (r) => (r.params as { clientId: string }).clientId,
    });
    await expect(
      guard(
        makeReq({
          org: { role: 'counselor', roleV2: 'counselor' },
          params: { clientId: 'c-1' },
          dataScope: { type: 'assigned', allowedClientIds: ['c-1'] },
        }),
        reply,
      ),
    ).resolves.toBeUndefined();
  });
});

describe('requireAction — Data Class gate', () => {
  it('班主任看 phi_full 被拒', async () => {
    const guard = requireAction('view', {
      type: 'assessment_result',
      dataClass: 'phi_full',
      extractOwnerUserId: (r) => (r.params as { studentId: string }).studentId,
    });
    await expect(
      guard(
        makeReq({
          org: {
            role: 'counselor',
            roleV2: 'homeroom_teacher',
            orgType: 'school',
            allowedDataClasses: ['de_identified', 'aggregate'],
          },
          params: { studentId: 's-1' },
        }),
        reply,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('班主任看 de_identified 通过', async () => {
    const guard = requireAction('view', {
      type: 'class_triage_bucket',
      dataClass: 'de_identified',
    });
    await expect(
      guard(
        makeReq({
          org: {
            role: 'counselor',
            roleV2: 'homeroom_teacher',
            orgType: 'school',
            allowedDataClasses: ['de_identified', 'aggregate'],
          },
        }),
        reply,
      ),
    ).resolves.toBeUndefined();
  });

  it('HR admin 看 phi_summary 被拒(合规硬红线)', async () => {
    const guard = requireAction('view', {
      type: 'assessment_result',
      dataClass: 'phi_summary',
      extractOwnerUserId: (r) => (r.params as { userId: string }).userId,
    });
    await expect(
      guard(
        makeReq({
          org: {
            role: 'org_admin',
            roleV2: 'hr_admin',
            orgType: 'enterprise',
            allowedDataClasses: ['aggregate'],
          },
          params: { userId: 'emp-1' },
        }),
        reply,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('requireAction — Scope gate', () => {
  it('counselor 看非分派 client → 拒(scope_not_assigned)', async () => {
    const guard = requireAction('view', {
      type: 'assessment_result',
      dataClass: 'phi_full',
      extractOwnerUserId: (r) => (r.params as { clientId: string }).clientId,
    });
    await expect(
      guard(
        makeReq({
          params: { clientId: 'c-other' },
          dataScope: { type: 'assigned', allowedClientIds: ['c-1'] },
        }),
        reply,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('counselor 看已分派 client → 通过', async () => {
    const guard = requireAction('view', {
      type: 'assessment_result',
      dataClass: 'phi_full',
      extractOwnerUserId: (r) => (r.params as { clientId: string }).clientId,
    });
    await expect(
      guard(
        makeReq({
          params: { clientId: 'c-1' },
          dataScope: { type: 'assigned', allowedClientIds: ['c-1'] },
        }),
        reply,
      ),
    ).resolves.toBeUndefined();
  });

  it('scope=all 时免去 ownerUserId 校验', async () => {
    const guard = requireAction('view', {
      type: 'assessment_result',
      dataClass: 'phi_full',
      extractOwnerUserId: (r) => (r.params as { clientId: string }).clientId,
    });
    await expect(
      guard(
        makeReq({
          params: { clientId: 'c-anything' },
          dataScope: { type: 'all' },
        }),
        reply,
      ),
    ).resolves.toBeUndefined();
  });

  it('学生看自己 self_only → 通过', async () => {
    const guard = requireAction('view', {
      type: 'my_profile',
      dataClass: 'self_only',
      extractOwnerUserId: (r) => (r.params as { userId: string }).userId,
    });
    await expect(
      guard(
        makeReq({
          user: { id: 'u-student', isSystemAdmin: false },
          org: {
            role: 'client',
            roleV2: 'student',
            orgType: 'school',
            principalClass: 'subject',
            allowedDataClasses: ['self_only'],
          },
          params: { userId: 'u-student' },
        }),
        reply,
      ),
    ).resolves.toBeUndefined();
  });

  it('学生看别人 self_only → 拒', async () => {
    const guard = requireAction('view', {
      type: 'my_profile',
      dataClass: 'self_only',
      extractOwnerUserId: (r) => (r.params as { userId: string }).userId,
    });
    await expect(
      guard(
        makeReq({
          user: { id: 'u-student', isSystemAdmin: false },
          org: {
            role: 'client',
            roleV2: 'student',
            orgType: 'school',
            principalClass: 'subject',
            allowedDataClasses: ['self_only'],
          },
          params: { userId: 'u-other-student' },
        }),
        reply,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('requireAction — system admin bypass', () => {
  it('system admin 无条件通过', async () => {
    const guard = requireAction('sign_off', {
      type: 'crisis_case',
      dataClass: 'phi_full',
      extractOwnerUserId: () => 'never-assigned',
    });
    await expect(
      guard(
        makeReq({
          user: { id: 'sys', isSystemAdmin: true },
          org: { role: 'counselor', roleV2: 'counselor' },
        }),
        reply,
      ),
    ).resolves.toBeUndefined();
  });
});

describe('requireAction — legacy fallback when roleV2 is null', () => {
  it('roleV2 缺失时,用 org.role + orgType 推导', async () => {
    const guard = requireAction('view', {
      type: 'assessment_result',
      dataClass: 'phi_full',
      extractOwnerUserId: (r) => (r.params as { clientId: string }).clientId,
    });
    // 不传 roleV2,只传 legacy role
    await expect(
      guard(
        makeReq({
          org: {
            role: 'counselor',
            roleV2: undefined,
            orgType: 'counseling',
            allowedDataClasses: undefined, // 让中间件自行推导
          },
          params: { clientId: 'c-1' },
          dataScope: { type: 'assigned', allowedClientIds: ['c-1'] },
        }),
        reply,
      ),
    ).resolves.toBeUndefined();
  });

  it('roleV2 缺失 + 企业 admin + 看 phi_full → 拒(HR 合规)', async () => {
    const guard = requireAction('view', {
      type: 'assessment_result',
      dataClass: 'phi_full',
      extractOwnerUserId: (r) => (r.params as { userId: string }).userId,
    });
    await expect(
      guard(
        makeReq({
          org: {
            role: 'org_admin',
            roleV2: undefined,
            orgType: 'enterprise',
            allowedDataClasses: undefined,
          },
          params: { userId: 'emp-1' },
          dataScope: { type: 'all' },
        }),
        reply,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

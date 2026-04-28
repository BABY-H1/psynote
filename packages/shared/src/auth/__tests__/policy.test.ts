import { describe, it, expect } from 'vitest';
import { authorize, type Actor, type Resource, type Scope } from '../policy.js';
import { roleAllowsDataClass, ROLE_DATA_CLASS_POLICY } from '../data-class.js';
import type { RoleV2 } from '../roles.js';

// ─── 测试夹具 ───────────────────────────────────────────────────

const CLIENT_ID = 'user-client-001';
const STUDENT_ID = 'user-student-001';
const SUPERVISEE_CLIENT = 'user-client-002';
const OTHER_CLIENT = 'user-client-999';

function counselorActor(overrides: Partial<Actor> = {}): Actor {
  return {
    orgType: 'counseling',
    role: 'counselor',
    userId: 'user-counselor-001',
    ...overrides,
  };
}

function teacherActor(): Actor {
  return {
    orgType: 'school',
    role: 'homeroom_teacher',
    userId: 'user-teacher-001',
  };
}

function leaderActor(): Actor {
  return {
    orgType: 'school',
    role: 'school_leader',
    userId: 'user-leader-001',
  };
}

function parentActor(): Actor {
  return {
    orgType: 'school',
    role: 'parent',
    userId: 'user-parent-001',
  };
}

function studentActor(userId = STUDENT_ID): Actor {
  return {
    orgType: 'school',
    role: 'student',
    userId,
  };
}

function hrActor(): Actor {
  return {
    orgType: 'enterprise',
    role: 'hr_admin',
    userId: 'user-hr-001',
  };
}

function resource(
  dataClass: Resource['dataClass'],
  ownerUserId: string | null = null,
): Resource {
  return { type: 'test', dataClass, ownerUserId };
}

// ─── Role × Action 粗筛 ────────────────────────────────────────

describe('authorize: Role × Action 粗筛', () => {
  it('counselor 不能 manage_license(admin-only)', () => {
    const d = authorize(
      counselorActor(),
      'manage_license',
      resource('aggregate'),
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/role_cannot_perform_action/);
  });

  it('clinic_admin 默认无法 view phi_full(严格合规默认 — 需 access_profile patch)', () => {
    const d = authorize(
      { orgType: 'counseling', role: 'clinic_admin', userId: 'u' },
      'view',
      resource('phi_full', CLIENT_ID),
      { allowedClientIds: [CLIENT_ID] },
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/role_data_class_not_allowed/);
  });

  it('clinic_admin 可以 view phi_summary(摘要级)', () => {
    const d = authorize(
      { orgType: 'counseling', role: 'clinic_admin', userId: 'u' },
      'view',
      resource('phi_summary', CLIENT_ID),
      { allowedClientIds: [CLIENT_ID] },
    );
    expect(d.allowed).toBe(true);
  });

  it('counselor 可以 view phi_full(自己的客户)', () => {
    const d = authorize(
      { orgType: 'counseling', role: 'counselor', userId: 'u' },
      'view',
      resource('phi_full', CLIENT_ID),
      { allowedClientIds: [CLIENT_ID] },
    );
    expect(d.allowed).toBe(true);
  });

  it('supervisor 可以 sign_off', () => {
    const d = authorize(
      { orgType: 'counseling', role: 'supervisor', userId: 'u-sup' },
      'sign_off',
      resource('phi_full', CLIENT_ID),
      { allowedClientIds: [CLIENT_ID] },
    );
    expect(d.allowed).toBe(true);
  });
});

// ─── Data Class 匹配 ───────────────────────────────────────────

describe('authorize: Data Class 匹配', () => {
  it('班主任看 phi_full 被拒(data class 白名单不覆盖)', () => {
    const d = authorize(
      teacherActor(),
      'view',
      resource('phi_full', STUDENT_ID),
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/role_data_class_not_allowed/);
  });

  it('班主任看 de_identified 通过(即便没有 scope,因为 de_identified 不做 owner 匹配)', () => {
    const d = authorize(
      teacherActor(),
      'view',
      resource('de_identified'),
    );
    expect(d.allowed).toBe(true);
  });

  it('分管领导看任何 individual 记录都被拒(aggregate-only)', () => {
    const dPhi = authorize(leaderActor(), 'view', resource('phi_full', STUDENT_ID));
    const dSum = authorize(leaderActor(), 'view', resource('phi_summary', STUDENT_ID));
    const dDei = authorize(leaderActor(), 'view', resource('de_identified', STUDENT_ID));
    expect(dPhi.allowed).toBe(false);
    expect(dSum.allowed).toBe(false);
    expect(dDei.allowed).toBe(false);
  });

  it('分管领导看 aggregate 通过', () => {
    const d = authorize(leaderActor(), 'view', resource('aggregate'));
    expect(d.allowed).toBe(true);
  });

  it('HR admin 看 phi_summary 被拒(合规硬红线,HR 只能看聚合)', () => {
    const d = authorize(hrActor(), 'view', resource('phi_summary', 'emp-1'));
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/role_data_class_not_allowed/);
  });
});

// ─── Scope 匹配:self_only / guardian_scope / assigned ───────

describe('authorize: self_only scope', () => {
  it('学生看自己的测评结果 → 允许', () => {
    const d = authorize(
      studentActor(STUDENT_ID),
      'view',
      resource('self_only', STUDENT_ID),
    );
    expect(d.allowed).toBe(true);
  });

  it('学生看别人的测评结果 → 拒绝', () => {
    const d = authorize(
      studentActor(STUDENT_ID),
      'view',
      resource('self_only', 'user-other-student'),
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('scope_not_self');
  });

  it('self_only 但 ownerUserId 为空 → 拒绝', () => {
    const d = authorize(
      studentActor(STUDENT_ID),
      'view',
      resource('self_only', null),
    );
    expect(d.allowed).toBe(false);
  });
});

describe('authorize: guardian_scope', () => {
  const CHILD_A = 'user-child-a';
  const CHILD_B = 'user-child-b';

  it('家长看自己孩子 → 允许', () => {
    const d = authorize(
      parentActor(),
      'view',
      resource('guardian_scope', CHILD_A),
      { guardianOfUserIds: [CHILD_A] },
    );
    expect(d.allowed).toBe(true);
  });

  it('家长看别人家孩子 → 拒绝', () => {
    const d = authorize(
      parentActor(),
      'view',
      resource('guardian_scope', CHILD_B),
      { guardianOfUserIds: [CHILD_A] },
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('scope_not_guardian');
  });

  it('家长 scope 为空 → 拒绝', () => {
    const d = authorize(
      parentActor(),
      'view',
      resource('guardian_scope', CHILD_A),
      {},
    );
    expect(d.allowed).toBe(false);
  });
});

describe('authorize: assigned/supervised scope for phi_full/phi_summary', () => {
  it('咨询师看自己分派 client 的 phi_full → 允许', () => {
    const d = authorize(
      counselorActor(),
      'view',
      resource('phi_full', CLIENT_ID),
      { allowedClientIds: [CLIENT_ID] },
    );
    expect(d.allowed).toBe(true);
  });

  it('咨询师看非分派 client 的 phi_full → 拒绝', () => {
    const d = authorize(
      counselorActor(),
      'view',
      resource('phi_full', OTHER_CLIENT),
      { allowedClientIds: [CLIENT_ID] },
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('scope_not_assigned');
  });

  it('督导看下属咨询师的 client → 允许', () => {
    const d = authorize(
      { orgType: 'counseling', role: 'supervisor', userId: 'u-sup' },
      'view',
      resource('phi_full', SUPERVISEE_CLIENT),
      { allowedClientIds: [], supervisedUserIds: [SUPERVISEE_CLIENT] },
    );
    expect(d.allowed).toBe(true);
  });

  it('creating 新资源(ownerUserId=null)→ 允许(交业务层复查)', () => {
    const d = authorize(
      counselorActor(),
      'create',
      resource('phi_full', null),
    );
    expect(d.allowed).toBe(true);
  });
});

// ─── Fail-closed 边界 ──────────────────────────────────────────

describe('authorize: fail-closed', () => {
  it('actor 为空 → 拒绝', () => {
    const d = authorize(null as any, 'view', resource('aggregate'));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('no_actor_role');
  });

  it('未知 role → 拒绝(无 data class policy)', () => {
    const d = authorize(
      { orgType: 'counseling', role: 'bogus_role' as RoleV2, userId: 'u' },
      'view',
      resource('aggregate'),
    );
    expect(d.allowed).toBe(false);
  });

  it('通过时返回 snapshot 供审计', () => {
    const d = authorize(
      counselorActor(),
      'view',
      resource('phi_full', CLIENT_ID),
      { allowedClientIds: [CLIENT_ID] },
    );
    expect(d.allowed).toBe(true);
    expect(d.snapshot).toEqual({
      role: 'counselor',
      principal: 'staff',
      dataClass: 'phi_full',
    });
  });
});

// ─── ROLE_DATA_CLASS_POLICY 结构 ──────────────────────────────

describe('ROLE_DATA_CLASS_POLICY 完整性', () => {
  it('每个角色都有至少一个允许的 data class', () => {
    for (const [role, classes] of Object.entries(ROLE_DATA_CLASS_POLICY)) {
      expect(
        classes.length,
        `role ${role} 没有可访问的 data class`,
      ).toBeGreaterThan(0);
    }
  });

  it('subject 类角色只能看 self_only', () => {
    for (const role of ['client', 'student', 'employee', 'patient'] as RoleV2[]) {
      expect(ROLE_DATA_CLASS_POLICY[role]).toEqual(['self_only']);
    }
  });

  it('proxy 类角色只能看 guardian_scope', () => {
    for (const role of ['parent', 'family'] as RoleV2[]) {
      expect(ROLE_DATA_CLASS_POLICY[role]).toEqual(['guardian_scope']);
    }
  });

  it('HR admin 硬红线:只能看 aggregate,不能看任何 PHI', () => {
    const hrPolicy = ROLE_DATA_CLASS_POLICY.hr_admin;
    expect(hrPolicy).toEqual(['aggregate']);
    expect(roleAllowsDataClass('hr_admin', 'phi_full')).toBe(false);
    expect(roleAllowsDataClass('hr_admin', 'phi_summary')).toBe(false);
    expect(roleAllowsDataClass('hr_admin', 'de_identified')).toBe(false);
  });

  it('分管领导硬红线:只能看 aggregate', () => {
    expect(ROLE_DATA_CLASS_POLICY.school_leader).toEqual(['aggregate']);
  });
});

import { describe, it, expect } from 'vitest';
import {
  computeRoleV2ForMember,
  type BackfillInput,
} from '../backfill-role-v2.js';

/**
 * Backfill mapping is a pure function — no DB. 测试只验证 (orgType, legacyRole,
 * 辅助字段) → { roleV2, principalClass, reason, requiresReview } 的推导规则,
 * 覆盖 plan 里的 5 个关键映射用例 + 若干边界。
 */

function make(overrides: Partial<BackfillInput>): BackfillInput {
  return {
    orgType: 'counseling',
    legacyRole: 'counselor',
    isGuardianAccount: false,
    hasStudentProfile: false,
    fullPracticeAccess: false,
    supervisorId: null,
    hasSupervisees: false,
    ...overrides,
  };
}

describe('computeRoleV2ForMember —— 核心映射', () => {
  it('咨询中心 counselor + fullPracticeAccess=true → supervisor', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'counseling', legacyRole: 'counselor', fullPracticeAccess: true }),
    );
    expect(r.roleV2).toBe('supervisor');
    expect(r.principalClass).toBe('staff');
    expect(r.requiresReview).toBe(false);
  });

  it('咨询中心 counselor + fullPracticeAccess=false → counselor', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'counseling', legacyRole: 'counselor' }),
    );
    expect(r.roleV2).toBe('counselor');
  });

  it('咨询中心 counselor + hasSupervisees=true(无 FPA) → supervisor(带下属即视为督导)', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'counseling', legacyRole: 'counselor', hasSupervisees: true }),
    );
    expect(r.roleV2).toBe('supervisor');
  });

  it('咨询中心 org_admin → clinic_admin', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'counseling', legacyRole: 'org_admin' }),
    );
    expect(r.roleV2).toBe('clinic_admin');
  });

  it('咨询中心 client → client', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'counseling', legacyRole: 'client' }),
    );
    expect(r.roleV2).toBe('client');
    expect(r.principalClass).toBe('subject');
  });
});

describe('computeRoleV2ForMember —— 学校场景', () => {
  it('学校 + client + isGuardianAccount=true → parent', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'school', legacyRole: 'client', isGuardianAccount: true }),
    );
    expect(r.roleV2).toBe('parent');
    expect(r.principalClass).toBe('proxy');
  });

  it('学校 + client + isGuardianAccount=false + hasStudentProfile → student', () => {
    const r = computeRoleV2ForMember(
      make({
        orgType: 'school',
        legacyRole: 'client',
        isGuardianAccount: false,
        hasStudentProfile: true,
      }),
    );
    expect(r.roleV2).toBe('student');
    expect(r.principalClass).toBe('subject');
  });

  it('学校 + client + 无监护 + 无 studentProfile → student(保守默认,留 requiresReview=true)', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'school', legacyRole: 'client' }),
    );
    expect(r.roleV2).toBe('student');
    expect(r.requiresReview).toBe(true);
    expect(r.reason).toMatch(/no_student_profile/);
  });

  it('学校 + counselor → psychologist', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'school', legacyRole: 'counselor' }),
    );
    expect(r.roleV2).toBe('psychologist');
  });

  it('学校 + org_admin → school_admin', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'school', legacyRole: 'org_admin' }),
    );
    expect(r.roleV2).toBe('school_admin');
  });
});

describe('computeRoleV2ForMember —— 企业场景', () => {
  it('企业 + org_admin → hr_admin(合规硬映射)', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'enterprise', legacyRole: 'org_admin' }),
    );
    expect(r.roleV2).toBe('hr_admin');
  });

  it('企业 + counselor → eap_consultant', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'enterprise', legacyRole: 'counselor' }),
    );
    expect(r.roleV2).toBe('eap_consultant');
  });

  it('企业 + client → employee', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'enterprise', legacyRole: 'client' }),
    );
    expect(r.roleV2).toBe('employee');
  });
});

describe('computeRoleV2ForMember —— Solo 场景', () => {
  it('solo + org_admin → owner', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'solo', legacyRole: 'org_admin' }),
    );
    expect(r.roleV2).toBe('owner');
  });

  it('solo + counselor → owner(同一人兼任)', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'solo', legacyRole: 'counselor' }),
    );
    expect(r.roleV2).toBe('owner');
  });

  it('solo + client → client', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'solo', legacyRole: 'client' }),
    );
    expect(r.roleV2).toBe('client');
  });
});

describe('computeRoleV2ForMember —— 返回 accessProfile(默认空,保留扩展)', () => {
  it('普通成员 accessProfile 返回空 {}', () => {
    const r = computeRoleV2ForMember(
      make({ orgType: 'counseling', legacyRole: 'counselor' }),
    );
    expect(r.accessProfile).toEqual({});
  });
});

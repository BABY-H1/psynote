import { describe, it, expect } from 'vitest';
import {
  SCHOOL_ROLES,
  COUNSELING_ROLES,
  ENTERPRISE_ROLES,
  SOLO_ROLES,
  HOSPITAL_ROLES,
  ROLES_BY_ORG_TYPE,
  isRoleValidForOrgType,
  principalOf,
  legacyRoleToV2,
} from '../roles.js';

describe('isRoleValidForOrgType', () => {
  it('学校 orgType 不接受 counselor(应走 psychologist)', () => {
    expect(isRoleValidForOrgType('school', 'counselor')).toBe(false);
  });

  it('咨询中心 orgType 不接受 homeroom_teacher', () => {
    expect(isRoleValidForOrgType('counseling', 'homeroom_teacher')).toBe(false);
  });

  it('企业 orgType 不接受 client / counselor / student', () => {
    expect(isRoleValidForOrgType('enterprise', 'client')).toBe(false);
    expect(isRoleValidForOrgType('enterprise', 'counselor')).toBe(false);
    expect(isRoleValidForOrgType('enterprise', 'student')).toBe(false);
  });

  it('合法组合全部通过', () => {
    expect(isRoleValidForOrgType('school', 'psychologist')).toBe(true);
    expect(isRoleValidForOrgType('school', 'student')).toBe(true);
    expect(isRoleValidForOrgType('school', 'parent')).toBe(true);
    expect(isRoleValidForOrgType('counseling', 'counselor')).toBe(true);
    expect(isRoleValidForOrgType('counseling', 'supervisor')).toBe(true);
    expect(isRoleValidForOrgType('enterprise', 'hr_admin')).toBe(true);
    expect(isRoleValidForOrgType('enterprise', 'eap_consultant')).toBe(true);
    expect(isRoleValidForOrgType('enterprise', 'employee')).toBe(true);
    expect(isRoleValidForOrgType('solo', 'owner')).toBe(true);
    expect(isRoleValidForOrgType('solo', 'client')).toBe(true);
  });

  it('未知 orgType 或未知 role 都返回 false', () => {
    expect(isRoleValidForOrgType('school', 'bogus_role')).toBe(false);
    expect(isRoleValidForOrgType('counseling' as any, '')).toBe(false);
  });
});

describe('ROLES_BY_ORG_TYPE completeness', () => {
  it('每个 orgType 都有至少一个 staff 和至少一个 subject/proxy', () => {
    for (const orgType of Object.keys(ROLES_BY_ORG_TYPE) as Array<
      keyof typeof ROLES_BY_ORG_TYPE
    >) {
      const roles = ROLES_BY_ORG_TYPE[orgType];
      const principals = roles.map((r) => principalOf(r));
      expect(principals.some((p) => p === 'staff')).toBe(true);
      expect(principals.some((p) => p === 'subject' || p === 'proxy')).toBe(true);
    }
  });

  it('角色集合内无重复', () => {
    for (const list of [
      SCHOOL_ROLES,
      COUNSELING_ROLES,
      ENTERPRISE_ROLES,
      SOLO_ROLES,
      HOSPITAL_ROLES,
    ]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

describe('principalOf', () => {
  it('client/student/employee/patient → subject', () => {
    expect(principalOf('client')).toBe('subject');
    expect(principalOf('student')).toBe('subject');
    expect(principalOf('employee')).toBe('subject');
    expect(principalOf('patient')).toBe('subject');
  });

  it('parent/family → proxy', () => {
    expect(principalOf('parent')).toBe('proxy');
    expect(principalOf('family')).toBe('proxy');
  });

  it('管理/执业岗位 → staff', () => {
    expect(principalOf('school_admin')).toBe('staff');
    expect(principalOf('school_leader')).toBe('staff');
    expect(principalOf('psychologist')).toBe('staff');
    expect(principalOf('homeroom_teacher')).toBe('staff');
    expect(principalOf('clinic_admin')).toBe('staff');
    expect(principalOf('supervisor')).toBe('staff');
    expect(principalOf('counselor')).toBe('staff');
    expect(principalOf('intern')).toBe('staff');
    expect(principalOf('receptionist')).toBe('staff');
    expect(principalOf('hr_admin')).toBe('staff');
    expect(principalOf('eap_consultant')).toBe('staff');
    expect(principalOf('owner')).toBe('staff');
    expect(principalOf('attending')).toBe('staff');
    expect(principalOf('nurse')).toBe('staff');
  });
});

describe('legacyRoleToV2', () => {
  it('学校 + org_admin → school_admin', () => {
    expect(legacyRoleToV2('school', 'org_admin')).toBe('school_admin');
  });

  it('学校 + counselor → psychologist', () => {
    expect(legacyRoleToV2('school', 'counselor')).toBe('psychologist');
  });

  it('学校 + client + 无监护 → student', () => {
    expect(legacyRoleToV2('school', 'client')).toBe('student');
  });

  it('学校 + client + isGuardianAccount=true → parent', () => {
    expect(legacyRoleToV2('school', 'client', { isGuardianAccount: true })).toBe(
      'parent',
    );
  });

  it('咨询中心 + client → client', () => {
    expect(legacyRoleToV2('counseling', 'client')).toBe('client');
  });

  it('企业 + org_admin → hr_admin(合规隔离的硬映射)', () => {
    expect(legacyRoleToV2('enterprise', 'org_admin')).toBe('hr_admin');
  });

  it('企业 + counselor → eap_consultant', () => {
    expect(legacyRoleToV2('enterprise', 'counselor')).toBe('eap_consultant');
  });

  it('个体咨询师 + org_admin/counselor → owner(同一人兼任)', () => {
    expect(legacyRoleToV2('solo', 'org_admin')).toBe('owner');
    expect(legacyRoleToV2('solo', 'counselor')).toBe('owner');
  });
});

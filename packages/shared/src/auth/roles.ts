import type { OrgType } from '../types/tier.js';
import type { Principal } from './principal.js';

/**
 * Role (V2) —— per-orgType 角色字典。
 *
 * 设计原则:
 *   1. 每个 orgType 有自己的合法角色集,DB CHECK constraint 保证跨类型不会串
 *   2. 角色名要具体、语义明确(宁可多几个,不要含糊)
 *   3. 本枚举是 V2,与 legacy `OrgRole` = 'org_admin' | 'counselor' | 'client' 并存
 *
 * 医院 orgType 暂不实装,占位
 */

// ─── School (学校) ────────────────────────────────────────────────
//   school_admin       — 校级管理员,机构运营
//   school_leader      — 分管领导,只看聚合仪表盘
//   psychologist       — 心理老师(专职心理咨询)
//   homeroom_teacher   — 班主任,只看自己班级的去标识化数据
//   student            — 学生(subject)
//   parent             — 家长/监护人(proxy)
export const SCHOOL_ROLES = [
  'school_admin',
  'school_leader',
  'psychologist',
  'homeroom_teacher',
  'student',
  'parent',
] as const;
export type SchoolRole = (typeof SCHOOL_ROLES)[number];

// ─── Counseling (咨询中心) ────────────────────────────────────────
//   clinic_admin       — 诊所/中心管理员
//   supervisor         — 督导
//   counselor          — 咨询师
//   intern             — 实习咨询师,受督导
//   receptionist       — 前台/接待,不触达临床数据
//   client             — 来访者(subject)
export const COUNSELING_ROLES = [
  'clinic_admin',
  'supervisor',
  'counselor',
  'intern',
  'receptionist',
  'client',
] as const;
export type CounselingRole = (typeof COUNSELING_ROLES)[number];

// ─── Enterprise (企业 EAP) ────────────────────────────────────────
//   hr_admin           — HR 管理员,只看聚合
//   eap_consultant     — EAP 咨询师
//   employee           — 员工(subject)
export const ENTERPRISE_ROLES = [
  'hr_admin',
  'eap_consultant',
  'employee',
] as const;
export type EnterpriseRole = (typeof ENTERPRISE_ROLES)[number];

// ─── Solo (个体咨询师) ────────────────────────────────────────────
//   owner              — 个体咨询师本人(兼管理员+咨询师)
//   client             — 来访者(subject)
export const SOLO_ROLES = ['owner', 'client'] as const;
export type SoloRole = (typeof SOLO_ROLES)[number];

// ─── Hospital (医疗机构) —— 占位,暂不实装 ────────────────────────
export const HOSPITAL_ROLES = [
  'hospital_admin',
  'attending',
  'resident',
  'nurse',
  'patient',
  'family',
] as const;
export type HospitalRole = (typeof HOSPITAL_ROLES)[number];

// ─── 统一联合类型 ────────────────────────────────────────────────
export type RoleV2 =
  | SchoolRole
  | CounselingRole
  | EnterpriseRole
  | SoloRole
  | HospitalRole;

export const ROLES_BY_ORG_TYPE: Record<OrgType, readonly RoleV2[]> = {
  school: SCHOOL_ROLES,
  counseling: COUNSELING_ROLES,
  enterprise: ENTERPRISE_ROLES,
  solo: SOLO_ROLES,
  hospital: HOSPITAL_ROLES,
};

/** 校验 role 是否属于给定 orgType 的合法角色集 */
export function isRoleValidForOrgType(
  orgType: OrgType,
  role: string,
): role is RoleV2 {
  const allowed = ROLES_BY_ORG_TYPE[orgType] as readonly string[] | undefined;
  if (!allowed) return false;
  return allowed.includes(role);
}

/** Role → Principal 映射(用于决定登录入口/Portal tab 集) */
export function principalOf(role: RoleV2): Principal {
  switch (role) {
    // Subject(服务对象本人)
    case 'client':
    case 'student':
    case 'employee':
    case 'patient':
      return 'subject';
    // Proxy(代理人/监护)
    case 'parent':
    case 'family':
      return 'proxy';
    // Staff(默认)——所有管理/执业岗位
    default:
      return 'staff';
  }
}

/**
 * Legacy OrgRole → RoleV2 fallback 映射。
 * 当 org_members.role_v2 为空时,用 legacy `role` 推一个保守值。
 * 注意:此映射不带 orgType 校验,调用方需自行保证 orgType 合法。
 *
 * - org_admin + orgType 拆分:
 *     school → school_admin, counseling → clinic_admin,
 *     enterprise → hr_admin, solo → owner, hospital → hospital_admin
 * - counselor + orgType 拆分:
 *     school → psychologist, counseling → counselor,
 *     enterprise → eap_consultant, solo → owner,
 *     hospital → attending (保守,实际需人工审)
 * - client + orgType 拆分:
 *     school → student (除非 isGuardianAccount=true,外层处理),
 *     counseling → client, enterprise → employee,
 *     solo → client, hospital → patient
 */
export function legacyRoleToV2(
  orgType: OrgType,
  legacyRole: 'org_admin' | 'counselor' | 'client',
  opts?: { isGuardianAccount?: boolean },
): RoleV2 {
  if (legacyRole === 'org_admin') {
    switch (orgType) {
      case 'school': return 'school_admin';
      case 'counseling': return 'clinic_admin';
      case 'enterprise': return 'hr_admin';
      case 'solo': return 'owner';
      case 'hospital': return 'hospital_admin';
    }
  }
  if (legacyRole === 'counselor') {
    switch (orgType) {
      case 'school': return 'psychologist';
      case 'counseling': return 'counselor';
      case 'enterprise': return 'eap_consultant';
      case 'solo': return 'owner';
      case 'hospital': return 'attending';
    }
  }
  // legacyRole === 'client'
  if (orgType === 'school') {
    return opts?.isGuardianAccount ? 'parent' : 'student';
  }
  if (orgType === 'enterprise') return 'employee';
  if (orgType === 'hospital') {
    return opts?.isGuardianAccount ? 'family' : 'patient';
  }
  return 'client'; // counseling, solo
}

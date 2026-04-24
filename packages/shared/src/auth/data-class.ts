import type { RoleV2 } from './roles.js';

/**
 * PHI 数据密级 (Data Classification) ——
 * 心理行业数据敏感,必须在"数据范围 (scope)"之外再套一层"数据密级",
 * 不同角色可触达的密级边界要在代码里声明、可审计、可解释。
 *
 *   phi_full        原始临床全文(逐字稿、病程录、完整测评答卷、AI 对话原文)
 *   phi_summary     临床摘要(结案报告、督导意见、干预建议摘要)
 *   de_identified   去标识化(研判分流 bucket 统计、无姓名案例教学材料)
 *   aggregate       聚合统计(EAP 分析、学校年级指标、匿名率)
 *   self_only       仅本人(自己的测评、预约、心情日记)
 *   guardian_scope  监护范围(家长能看的孩子数据子集,不含逐字稿)
 *
 * 这 6 档不是一条线性链,而是一张**交叉覆盖图**:
 *   - staff 角色通常覆盖 phi_full..aggregate 的子集
 *   - subject 只覆盖 self_only
 *   - proxy 只覆盖 guardian_scope
 *   - 有的 staff(班主任、分管领导)被限制在 de_identified / aggregate
 */
export const DATA_CLASSES = [
  'phi_full',
  'phi_summary',
  'de_identified',
  'aggregate',
  'self_only',
  'guardian_scope',
] as const;
export type DataClass = (typeof DATA_CLASSES)[number];

/**
 * Role → 可触达的 data class 白名单。
 * 这是**硬编码策略**,不在 UI 里让机构管理员自定义(防止授权漂移)。
 * 后续若需特例(某机构班主任要看 phi_summary),走 `access_profile.dataClasses`
 * 单点覆盖,而不是改这张表。
 */
export const ROLE_DATA_CLASS_POLICY: Record<RoleV2, readonly DataClass[]> = {
  // ─── School ──────────────────────────────────
  school_admin: ['phi_summary', 'de_identified', 'aggregate'],
  // 分管领导只看聚合,防止一把手直接翻个案
  school_leader: ['aggregate'],
  psychologist: ['phi_full', 'phi_summary', 'de_identified', 'aggregate'],
  // 班主任不能看临床原文,只能看去标识化班级数据 + 聚合
  homeroom_teacher: ['de_identified', 'aggregate'],
  student: ['self_only'],
  parent: ['guardian_scope'],

  // ─── Counseling ──────────────────────────────
  clinic_admin: ['phi_full', 'phi_summary', 'de_identified', 'aggregate'],
  supervisor: ['phi_full', 'phi_summary', 'de_identified', 'aggregate'],
  counselor: ['phi_full', 'phi_summary', 'de_identified', 'aggregate'],
  // 实习咨询师:全文但督导在场;这里允许,scope 层在督导模型里收紧
  intern: ['phi_full', 'phi_summary', 'de_identified', 'aggregate'],
  // 前台不碰临床
  receptionist: ['aggregate'],
  client: ['self_only'],

  // ─── Enterprise ──────────────────────────────
  // HR 只看聚合,合规硬红线
  hr_admin: ['aggregate'],
  eap_consultant: ['phi_full', 'phi_summary', 'de_identified'],
  employee: ['self_only'],

  // ─── Solo ────────────────────────────────────
  owner: ['phi_full', 'phi_summary', 'de_identified', 'aggregate'],

  // ─── Hospital (占位) ─────────────────────────
  hospital_admin: ['phi_summary', 'de_identified', 'aggregate'],
  attending: ['phi_full', 'phi_summary', 'de_identified', 'aggregate'],
  resident: ['phi_full', 'phi_summary', 'de_identified', 'aggregate'],
  nurse: ['phi_summary', 'de_identified', 'aggregate'],
  patient: ['self_only'],
  family: ['guardian_scope'],
};

/** 返回该角色是否允许访问某一数据密级(纯 policy 层,不涉 scope) */
export function roleAllowsDataClass(role: RoleV2, cls: DataClass): boolean {
  const allowed = ROLE_DATA_CLASS_POLICY[role] as readonly DataClass[] | undefined;
  if (!allowed) return false; // fail-closed for unknown role
  return allowed.includes(cls);
}

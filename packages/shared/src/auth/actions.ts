/**
 * Action 权限动作词表 —— `requireAction(action, resource)` 中间件用。
 *
 * 本词表刻意**粗粒度**(10 个左右),Phase 1 先覆盖"角色-能力粗筛",
 * 细粒度业务动作(如"发布筛查测评"vs"发布干预性测评")不在这一层,
 * 走具体路由的业务判断。
 */
export const ACTIONS = [
  'view',              // 读资源
  'edit',              // 改资源
  'create',            // 建资源
  'delete',            // 删资源
  'sign_off',          // 签字(危机案、督导审核)
  'export',            // 导出(数据出口)
  'publish',           // 发布(测评/课程上线)
  'assign',            // 派单/分派咨询师
  'override_risk_level', // 覆盖 AI 判级
  'invite_member',     // 邀请成员
  'manage_license',    // 机构许可/计费
  'manage_org_settings', // 改机构品牌/配置
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Role × Action 粗筛白名单。
 *
 * 这张表只决定"该角色**能否在语义上**做这个动作",不考虑具体资源归属、
 * 数据密级、scope —— 那些由 `authorize()` 的后两道检查处理。
 *
 * 未在白名单上的 (role, action) 组合 → fail closed 拒绝。
 */
import type { RoleV2 } from './roles.js';

export const ROLE_ACTION_WHITELIST: Record<RoleV2, readonly Action[]> = {
  // ─── School ──────────────────────────────────
  school_admin: [
    'view', 'edit', 'create', 'delete', 'sign_off', 'export',
    'publish', 'assign', 'override_risk_level',
    'invite_member', 'manage_license', 'manage_org_settings',
  ],
  // 分管领导只读聚合
  school_leader: ['view', 'export'],
  psychologist: [
    'view', 'edit', 'create', 'sign_off', 'publish', 'assign', 'override_risk_level',
  ],
  // 班主任:只能看班级视角,可为自己班发测评(由后端业务层二次校验)
  homeroom_teacher: ['view', 'publish'],
  student: ['view'],
  parent: ['view'],

  // ─── Counseling ──────────────────────────────
  clinic_admin: [
    'view', 'edit', 'create', 'delete', 'sign_off', 'export',
    'publish', 'assign', 'override_risk_level',
    'invite_member', 'manage_license', 'manage_org_settings',
  ],
  supervisor: [
    'view', 'edit', 'create', 'sign_off', 'export',
    'publish', 'assign', 'override_risk_level',
  ],
  counselor: [
    'view', 'edit', 'create', 'publish', 'override_risk_level',
  ],
  client: ['view'],

  // ─── Enterprise ──────────────────────────────
  hr_admin: ['view', 'export', 'invite_member', 'manage_license', 'manage_org_settings'],
  eap_consultant: [
    'view', 'edit', 'create', 'sign_off', 'publish', 'assign', 'override_risk_level',
  ],
  employee: ['view'],

  // ─── Solo ────────────────────────────────────
  owner: [
    'view', 'edit', 'create', 'delete', 'sign_off', 'export',
    'publish', 'assign', 'override_risk_level',
    'invite_member', 'manage_license', 'manage_org_settings',
  ],

  // ─── Hospital (占位) ─────────────────────────
  hospital_admin: [
    'view', 'edit', 'create', 'export', 'invite_member', 'manage_license', 'manage_org_settings',
  ],
  attending: [
    'view', 'edit', 'create', 'sign_off', 'publish', 'assign', 'override_risk_level',
  ],
  resident: ['view', 'edit', 'create'],
  nurse: ['view', 'edit'],
  patient: ['view'],
  family: ['view'],
};

export function roleCanPerformAction(role: RoleV2, action: Action): boolean {
  const allowed = ROLE_ACTION_WHITELIST[role] as readonly Action[] | undefined;
  if (!allowed) return false; // fail-closed for unknown role
  return allowed.includes(action);
}

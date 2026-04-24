import type { OrgType } from '../types/tier.js';
import type { RoleV2 } from './roles.js';
import { principalOf } from './roles.js';
import type { Principal } from './principal.js';
import type { DataClass } from './data-class.js';
import { roleAllowsDataClass } from './data-class.js';
import type { Action } from './actions.js';
import { roleCanPerformAction } from './actions.js';

/**
 * authorize() —— 三道检查的纯函数权限决策器
 *
 *   1. Role × Action 白名单粗筛:此角色本身能不能做这种动作?
 *   2. Data Class 匹配:actor 角色允许的 data class 集合包含 resource.dataClass?
 *   3. Scope 匹配:按 dataClass 语义比对 actor scope:
 *        - self_only      必须 isSelf
 *        - guardian_scope 必须 isGuardianOf(resource.ownerUserId)
 *        - phi_full / phi_summary (assigned 语义) 必须 ownerUserId ∈ allowedClientIds ∪ supervisedUserIds
 *        - de_identified / aggregate 不做个体匹配(但可按 class/org 限定 —— v1 不限)
 *
 * Fail-closed:三道任一失败,allowed=false。
 * 纯函数、无 IO、O(1) —— 可在请求热路径上自由调用。
 */

export interface Actor {
  orgType: OrgType;
  role: RoleV2;
  userId: string;
  /** 是否督导身份(派生自 role + 业务规则;Phase 1 保留此 flag 兼容 legacy fullPracticeAccess) */
  isSupervisor?: boolean;
}

export interface Resource {
  /** 资源类型描述(仅日志与审计用,不参与决策) */
  type: string;
  /** 数据密级 —— 权限决策的核心维度 */
  dataClass: DataClass;
  /** 对于 subject/proxy 类数据,资源所属的 user(用于 isSelf/isGuardianOf 判定) */
  ownerUserId?: string | null;
  /** 资源所属 org(暂未用于决策,保留扩展) */
  orgId?: string | null;
}

export interface Scope {
  /** 此 actor 作为 counselor 已被分派或授权的 client userIds */
  allowedClientIds?: readonly string[];
  /** 作为督导,下属 counselor 的 userIds(通过 supervisorId 树推出,外层已 resolve 完毕) */
  supervisedUserIds?: readonly string[];
  /** 作为 proxy,监护的 subject userIds */
  guardianOfUserIds?: readonly string[];
  /** 作为 homeroom_teacher,负责的 classIds(目前不参与决策,Phase 2 接班级 scope 时再用) */
  homeroomClassIds?: readonly string[];
}

export interface Decision {
  allowed: boolean;
  /** 被拒原因 —— 在 allowed=false 时必填,便于审计 */
  reason?: string;
  /** 通过此决策时的快照,写审计日志用 */
  snapshot?: {
    role: RoleV2;
    principal: Principal;
    dataClass: DataClass;
  };
}

export function authorize(
  actor: Actor,
  action: Action,
  resource: Resource,
  scope?: Scope,
): Decision {
  // ── 0. 防御 —— actor/role 必填,fail-closed
  if (!actor || !actor.role) {
    return { allowed: false, reason: 'no_actor_role' };
  }

  // ── 1. Role × Action 粗筛
  if (!roleCanPerformAction(actor.role, action)) {
    return {
      allowed: false,
      reason: `role_cannot_perform_action:${actor.role}/${action}`,
    };
  }

  // ── 2. Data Class 匹配
  if (!roleAllowsDataClass(actor.role, resource.dataClass)) {
    return {
      allowed: false,
      reason: `role_data_class_not_allowed:${actor.role}/${resource.dataClass}`,
    };
  }

  // ── 3. Scope 匹配(按 dataClass 语义)
  const scopeCheck = checkScope(actor, resource, scope);
  if (!scopeCheck.allowed) {
    return scopeCheck;
  }

  // ── 通过
  return {
    allowed: true,
    snapshot: {
      role: actor.role,
      principal: principalOf(actor.role),
      dataClass: resource.dataClass,
    },
  };
}

function checkScope(
  actor: Actor,
  resource: Resource,
  scope?: Scope,
): Decision {
  const cls = resource.dataClass;
  const ownerId = resource.ownerUserId ?? null;

  // self_only —— 必须是资源本人
  if (cls === 'self_only') {
    if (!ownerId || ownerId !== actor.userId) {
      return { allowed: false, reason: 'scope_not_self' };
    }
    return { allowed: true };
  }

  // guardian_scope —— 必须是代理人且监护此 subject
  if (cls === 'guardian_scope') {
    if (!ownerId || !scope?.guardianOfUserIds?.includes(ownerId)) {
      return { allowed: false, reason: 'scope_not_guardian' };
    }
    return { allowed: true };
  }

  // phi_full / phi_summary —— 个案级数据,必须 assigned 或被督导
  if (cls === 'phi_full' || cls === 'phi_summary') {
    if (!ownerId) {
      // 没有 ownerUserId(例如正在创建新资源)—— 交给具体路由在业务层再校验
      return { allowed: true };
    }
    const inAssigned = scope?.allowedClientIds?.includes(ownerId) ?? false;
    const inSupervised = scope?.supervisedUserIds?.includes(ownerId) ?? false;
    // 督导身份下,允许访问下属的案件 —— 与现有 data-scope.ts 语义一致
    if (inAssigned || inSupervised) return { allowed: true };
    // 某些角色(solo owner、clinic_admin)全机构可见,scope 层通常会把
    // 对应 orgId 下所有 client 塞进 allowedClientIds,所以这里不需要特例
    return { allowed: false, reason: 'scope_not_assigned' };
  }

  // de_identified / aggregate —— 个体身份已被脱敏,不做 owner 匹配
  // (Phase 2 若要按 org/class 收紧,扩展 scope 即可)
  if (cls === 'de_identified' || cls === 'aggregate') {
    return { allowed: true };
  }

  // 未知 dataClass —— fail closed
  return { allowed: false, reason: `unknown_data_class:${cls}` };
}

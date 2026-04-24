import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  authorize,
  legacyRoleToV2,
  type Action,
  type Actor,
  type DataClass,
  type Resource,
  type RoleV2,
  type Scope,
} from '@psynote/shared';
import { ForbiddenError } from '../lib/errors.js';

/**
 * requireAction —— Phase 1 新授权中间件。
 *
 * 叠加在 requireRole / dataScopeGuard 之上或替代它们。本轮(Phase 1)不替换
 * 任何现有路由,只提供入口供 Phase 2 起逐条迁移。
 *
 * 决策流:
 *   1. system admin 直接放行(与 requireRole 一致,保留兼容语义)
 *   2. 从 request.org 解析 Actor(优先 roleV2,空则 legacy role + orgType fallback)
 *   3. 拼 Resource(dataClass 由调用方声明;ownerUserId 由 extractor 抽)
 *   4. 拼 Scope(从 request.dataScope;type='all' 时直通 owner 校验)
 *   5. 调 shared auth 库的 authorize(),失败抛 ForbiddenError 带 reason
 *
 * 纯计算 + 一次 extractor 抽值,无 DB 调用。热路径安全。
 */
export interface ResourceSelector {
  /** 资源类型,仅审计日志用 */
  type: string;
  /** 资源数据密级 —— 权限决策核心维度 */
  dataClass: DataClass;
  /**
   * 从 request 中抽出资源拥有者 userId(用于 self_only / guardian_scope /
   * assigned 语义校验)。没 owner 的聚合类资源可省略。
   */
  extractOwnerUserId?: (req: FastifyRequest) => string | null | undefined;
  /** 资源所属 orgId(默认取 request.org.orgId) */
  extractOrgId?: (req: FastifyRequest) => string | null | undefined;
}

export function requireAction(action: Action, selector: ResourceSelector) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    // System admin bypass —— 与 requireRole 语义一致
    if (request.user?.isSystemAdmin) return;

    const org = request.org;
    if (!org) {
      throw new ForbiddenError('org context required');
    }

    const actor = resolveActor(request);
    if (!actor) {
      throw new ForbiddenError('no resolvable role for actor');
    }

    const ownerUserId = selector.extractOwnerUserId?.(request) ?? null;
    const orgId = selector.extractOrgId?.(request) ?? org.orgId;

    const resource: Resource = {
      type: selector.type,
      dataClass: selector.dataClass,
      ownerUserId,
      orgId,
    };

    const scope = resolveScope(request, actor, ownerUserId);

    const decision = authorize(actor, action, resource, scope);
    if (!decision.allowed) {
      throw new ForbiddenError(
        `action_denied:${action}/${selector.type}:${decision.reason ?? 'unknown'}`,
      );
    }
    // Phase 2+: 这里可把 decision.snapshot 落到 phi_access_logs
  };
}

// ─── helpers ──────────────────────────────────────────────────────

function resolveActor(request: FastifyRequest): Actor | null {
  const org = request.org;
  const userId = request.user?.id;
  if (!org || !userId) return null;

  // 优先 roleV2;为空则用 legacy role + orgType 推
  let role: RoleV2 | undefined = (org as unknown as { roleV2?: RoleV2 }).roleV2;
  if (!role) {
    role = legacyRoleToV2(org.orgType, org.role);
  }

  const isSupervisor =
    (org as unknown as { isSupervisor?: boolean }).isSupervisor ??
    (org.role === 'counselor' && org.fullPracticeAccess);

  return {
    orgType: org.orgType,
    role,
    userId,
    isSupervisor,
  };
}

function resolveScope(
  request: FastifyRequest,
  actor: Actor,
  ownerUserId: string | null,
): Scope {
  const org = request.org!;
  const ds = request.dataScope;

  // scope='all' 直通语义 —— 把 ownerUserId 自身注入 allowedClientIds,
  // 让 policy.ts 的 phi_full/phi_summary 分支自然通过,无需污染 shared 纯函数。
  let allowedClientIds: readonly string[] | undefined;
  if (ds?.type === 'all') {
    // 无 owner 或有 owner 都直通;没 owner 的 policy 已经按"create 新资源"放行
    allowedClientIds = ownerUserId ? [ownerUserId] : undefined;
  } else if (ds?.type === 'assigned') {
    allowedClientIds = ds.allowedClientIds;
  }
  // ds=undefined / 'none' / 'aggregate_only' → allowedClientIds 保持 undefined;
  // phi_full/phi_summary 资源会因此在 policy 里被拒,符合预期

  // guardianOfUserIds 将在 Phase 2 proxy 流水线里接入;Phase 1 占位
  const guardianOfUserIds = (org as unknown as {
    guardianOfUserIds?: readonly string[];
  }).guardianOfUserIds;

  // 督导下属的 supervisee userIds —— 现有 data-scope.ts 已经把下属的
  // client 合并进 assigned 列表,所以正常路径下这里不需要再拆。保留为
  // Phase 2+ 细粒度场景(如按督导链做审计)预留。
  const supervisedUserIds = actor.isSupervisor
    ? (org as unknown as { superviseeUserIds?: readonly string[] })
        .superviseeUserIds
    : undefined;

  return {
    allowedClientIds,
    supervisedUserIds,
    guardianOfUserIds,
  };
}

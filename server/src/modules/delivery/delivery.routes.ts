import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import { listServiceInstances, type ServiceKindInput } from './delivery.service.js';
// Phase 9β — unified launch verb
import { launch, type LaunchActionType, type LaunchPayload } from './launch.service.js';
import { rejectClient } from '../../middleware/reject-client.js';

/**
 * Phase 5b — Cross-module service aggregation route.
 *
 *   GET /api/orgs/:orgId/services
 *
 * Query params (all optional):
 *   kind     comma-separated list, e.g. "counseling,group" or single "counseling"
 *   status   comma-separated list of ServiceStatus values
 *   limit    1..500, default 60
 *   offset   default 0
 *
 * Returns: { items: ServiceInstance[], total: number }
 *
 * RBAC note: this route is org-scoped via `orgContextGuard`. The current
 * implementation does NOT enforce per-counselor data scoping (Phase 5b ships
 * the SQL aggregation; the existing per-module endpoints already apply the
 * dataScopeGuard for fine-grained scoping). If counselors should only see
 * services they own, that filter must be added here in a follow-up.
 */
export async function deliveryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', rejectClient);

  app.get('/services', async (request) => {
    const orgId = request.org!.orgId;
    const query = request.query as {
      kind?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };

    const kinds = parseKindList(query.kind);
    const statuses = parseList(query.status);
    const limit = query.limit ? Number(query.limit) : undefined;
    const offset = query.offset ? Number(query.offset) : undefined;

    return listServiceInstances(orgId, { kinds, statuses, limit, offset });
  });

  /**
   * Phase 9β — unified launch verb.
   * POST /api/orgs/:orgId/services/launch
   * body: { actionType: LaunchActionType, payload: LaunchPayload }
   *
   * One call site that creates a course/group/episode/assessment/consent/referral
   * and returns a normalized envelope so the caller can navigate to the new
   * resource. Used by the AI suggestion panel ("一键采纳") and by the unified
   * "+ 启动新服务" button on the delivery center.
   */
  app.post('/services/launch', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as { actionType?: LaunchActionType; payload?: LaunchPayload };
    if (!body.actionType) throw new ValidationError('actionType is required');
    if (!body.payload) throw new ValidationError('payload is required');

    const result = await launch({
      orgId: request.org!.orgId,
      userId: request.user!.id,
      actionType: body.actionType,
      payload: body.payload,
    });

    await logAudit(request, 'launch', `service:${result.kind}`, result.instanceId);
    return reply.status(201).send(result);
  });
}

function parseList(v?: string): string[] | undefined {
  if (!v) return undefined;
  const arr = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length > 0 ? arr : undefined;
}

function parseKindList(v?: string): ServiceKindInput[] | undefined {
  const list = parseList(v);
  if (!list) return undefined;
  const valid = new Set<ServiceKindInput>(['counseling', 'group', 'course', 'assessment']);
  const filtered = list.filter((k): k is ServiceKindInput => valid.has(k as ServiceKindInput));
  return filtered.length > 0 ? filtered : undefined;
}

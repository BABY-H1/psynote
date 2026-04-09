import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { listServiceInstances, type ServiceKindInput } from './delivery.service.js';

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

import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { dataScopeGuard } from '../../middleware/data-scope.js';
import { requireSystemAdmin } from '../../middleware/system-admin.js';
import { aiClient } from './providers/openai-compatible.js';

/**
 * Shared preHandler chain applied once at the AI-routes root. All sub-route
 * modules (ai-assessment / ai-treatment / ai-scales-material / …) inherit
 * these hooks because they are registered AFTER these hooks are installed
 * on the parent instance.
 *
 *   1. 5-minute socket timeout — AI calls with thinking models (qwen3.5-plus)
 *      can take 30-60s generating large structured JSON; default Node socket
 *      timeout would kill the upstream fetch mid-response.
 *   2. auth → orgContext → dataScope — standard org-scoped chain.
 *   3. aiClient configuration check — return 503 if AI_API_KEY is missing
 *      so the client surfaces a clean "AI not configured" rather than a
 *      cryptic "AI provider not configured" thrown deep in a pipeline.
 */
export function applyAiGuards(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    // 10 min — must exceed AIClient.chat fetch timeout (9 min) so AI 端超时
    // 先于 socket 关闭,前端能拿到具体错误信息而不是空响应.
    request.socket.setTimeout(600_000);
  });

  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', dataScopeGuard);

  app.addHook('preHandler', async (_request, reply) => {
    if (!aiClient.isConfigured) {
      return reply.status(503).send({ error: 'AI service is not configured' });
    }
  });
}

/**
 * Variant of `applyAiGuards` for the system-admin-scoped AI routes mounted
 * at `/api/admin/ai`. The admin doesn't belong to any org, so we can't run
 * `orgContextGuard` (it throws when `:orgId` is missing). Instead we gate on
 * `requireSystemAdmin`.
 *
 * Only the library-authoring AI sub-modules (scales / schemes / courses /
 * templates) are mounted under this path — clinical sub-modules
 * (assessment / treatment) still need org context to resolve client data
 * and are intentionally not reachable here.
 */
export function applyAdminAiGuards(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    // 10 min — same as the org-scoped path (matches openai-compatible.ts 9-min ceiling).
    request.socket.setTimeout(600_000);
  });

  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', requireSystemAdmin);

  app.addHook('preHandler', async (_request, reply) => {
    if (!aiClient.isConfigured) {
      return reply.status(503).send({ error: 'AI service is not configured' });
    }
  });
}

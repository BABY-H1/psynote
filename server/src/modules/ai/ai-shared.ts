import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { dataScopeGuard } from '../../middleware/data-scope.js';
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
    request.socket.setTimeout(300_000); // 5 min
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

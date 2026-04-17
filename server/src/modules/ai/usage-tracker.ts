/**
 * AI usage tracker — persists token counts per org per pipeline.
 *
 * Pipelines hand off their usage by calling `logAiUsage()` after a successful
 * AI call. The SubscriptionTab aggregates by current month against the org's
 * configured `monthlyTokenLimit` (in `organizations.settings.aiConfig`).
 *
 * Writes are fire-and-forget: tracking failures must never surface to the
 * caller, as that would block the user-facing feature.
 */
import { db } from '../../config/database.js';
import { aiCallLogs } from '../../db/schema.js';

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model?: string;
}

export interface AiCallContext {
  orgId: string;
  userId?: string | null;
  pipeline: string;
}

/**
 * Log a successful AI call to `ai_call_logs`. Fire-and-forget — errors are
 * swallowed so caller flow is never blocked.
 */
export function logAiUsage(ctx: AiCallContext, usage: AiUsage): void {
  if (!ctx.orgId) return;
  db.insert(aiCallLogs)
    .values({
      orgId: ctx.orgId,
      userId: ctx.userId ?? null,
      pipeline: ctx.pipeline,
      model: usage.model ?? null,
      promptTokens: usage.promptTokens ?? 0,
      completionTokens: usage.completionTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    })
    .then(() => {})
    .catch((err) => {
      console.warn('[ai-usage-tracker] failed to log:', err?.message || err);
    });
}

/**
 * AIProvenance — provenance metadata for any AI-generated payload that
 * eventually surfaces to a user (recommendations, interpretations,
 * generated drafts, etc.).
 *
 * Stored alongside the payload, not mixed in, so existing AI-typed
 * shapes (TriageRecommendation, ComplianceReview, …) don't have to
 * be reshaped. The convention:
 *
 *   row.recommendations  : TriageRecommendation[]   ← payload
 *   row.aiProvenance     : AIProvenance | null      ← metadata
 *
 * Why we expose this to the UI: high-stakes domains (心理 / 医疗 /
 * 法律) require AI output to be visibly distinguishable from human
 * output. The <AIBadge /> consumes this shape and renders an "AI 生成"
 * label with model + time + (optional) confidence.
 *
 * **DO NOT** put PHI in here — provenance is metadata only. If a
 * pipeline needs to record a prompt or response transcript, write it
 * to ai_audit_logs (separate table), not here.
 */
export interface AIProvenance {
  /**
   * Discriminator. Always `true` — its presence in the payload row is
   * itself the "this came from an AI" signal. Keeping it as a literal
   * (not boolean) lets TS narrow on the field's existence.
   */
  aiGenerated: true;

  /**
   * Model identifier, e.g.:
   *   'claude-3-7-sonnet-20250219'
   *   'gpt-4o-2024-08-06'
   *   'deepseek-chat-v3.1'
   * Pipelines should pass through whatever the provider returns rather
   * than aliasing — we want to be able to tell exact model versions
   * apart for QA and incident triage.
   */
  aiModel: string;

  /**
   * Optional 0..1 confidence the model self-reported (or the pipeline
   * computed from logprobs / multi-sample agreement). Surfaced as a
   * percentage in the badge tooltip.
   */
  aiConfidence?: number;

  /**
   * ISO 8601 datetime — when the model produced the output.
   * Use the model's *response* timestamp, not the row's createdAt
   * (the latter would also include re-saves / migrations).
   */
  aiGeneratedAt: string;

  /**
   * Pipeline name. Matches `usage-tracker.AiCallContext.pipeline`,
   * e.g. `'triage-auto'`, `'soap-analysis'`, `'compliance-review'`.
   * Useful for end-users debugging "why did the AI say this" and for
   * us to track per-pipeline accuracy.
   */
  aiPipeline?: string;

  /**
   * Optional human-review trail. Once a counselor reviews and decides,
   * stamp this so the badge can show "已审核" instead of just "AI 生成".
   * `decision` semantics:
   *   - 'accepted' — taken as-is
   *   - 'edited'   — accepted with edits (the displayed payload may
   *                  no longer match the original AI output)
   *   - 'rejected' — kept on file but not used clinically
   */
  aiReviewedBy?: {
    userId: string;
    reviewedAt: string;
    decision: 'accepted' | 'edited' | 'rejected';
  };
}

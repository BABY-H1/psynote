-- Phase 11 — AI usage tracking
-- Records each AI pipeline call's token usage so the SubscriptionTab can show
-- "本月 AI 用量 / 上限" to the org admin.

CREATE TABLE IF NOT EXISTS "ai_call_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "pipeline" text NOT NULL,
  "model" text,
  "prompt_tokens" integer NOT NULL DEFAULT 0,
  "completion_tokens" integer NOT NULL DEFAULT 0,
  "total_tokens" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ai_call_logs_org_created"
  ON "ai_call_logs"("org_id", "created_at");

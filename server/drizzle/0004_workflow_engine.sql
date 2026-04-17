-- Phase 12 — Workflow rule engine + candidate pool
-- See triage-automation.service.ts (refactored to call this engine) and
-- client features/settings/pages/RulesTab.tsx.

CREATE TABLE IF NOT EXISTS "workflow_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "trigger_event" text NOT NULL,
  "conditions" jsonb NOT NULL DEFAULT '[]',
  "actions" jsonb NOT NULL DEFAULT '[]',
  "is_active" boolean NOT NULL DEFAULT true,
  "priority" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_workflow_rules_org_trigger_active"
  ON "workflow_rules"("org_id", "trigger_event", "is_active");

CREATE TABLE IF NOT EXISTS "workflow_executions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "rule_id" uuid REFERENCES "workflow_rules"("id") ON DELETE CASCADE,
  "trigger_event" text NOT NULL,
  "event_payload" jsonb NOT NULL DEFAULT '{}',
  "conditions_matched" boolean NOT NULL,
  "actions_result" jsonb NOT NULL DEFAULT '[]',
  "status" text NOT NULL,
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_workflow_executions_org_rule"
  ON "workflow_executions"("org_id", "rule_id", "created_at");

CREATE TABLE IF NOT EXISTS "candidate_pool" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "client_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "suggestion" text NOT NULL,
  "reason" text,
  "priority" text NOT NULL DEFAULT 'normal',
  "source_rule_id" uuid REFERENCES "workflow_rules"("id") ON DELETE SET NULL,
  "source_result_id" uuid,
  "source_payload" jsonb DEFAULT '{}',
  "status" text NOT NULL DEFAULT 'pending',
  "assigned_to_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "handled_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "handled_at" timestamptz,
  "handled_note" text,
  "resolved_ref_type" text,
  "resolved_ref_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_candidate_pool_org_status_kind"
  ON "candidate_pool"("org_id", "status", "kind");

CREATE INDEX IF NOT EXISTS "idx_candidate_pool_client"
  ON "candidate_pool"("client_user_id", "status");

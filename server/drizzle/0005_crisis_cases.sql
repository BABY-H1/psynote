-- Phase 13 — Crisis handling workflow
-- See client/src/features/counseling/components/CrisisChecklistPanel.tsx
-- and server/src/modules/crisis/crisis-case.service.ts.

-- 1. Extend client_documents to support sending documents to guardians (not
--    just the client themselves). Default stays 'client' so all existing rows
--    are untouched.
ALTER TABLE "client_documents"
  ADD COLUMN IF NOT EXISTS "recipient_type" text NOT NULL DEFAULT 'client';

ALTER TABLE "client_documents"
  ADD COLUMN IF NOT EXISTS "recipient_name" text;

-- 2. Extend workflow_rules with scope_assessment_id + source columns
--    (these are idempotent — if 0004 already had a follow-up migration that
--    added them, nothing changes).
ALTER TABLE "workflow_rules"
  ADD COLUMN IF NOT EXISTS "scope_assessment_id" uuid;

ALTER TABLE "workflow_rules"
  ADD COLUMN IF NOT EXISTS "source" text;

CREATE INDEX IF NOT EXISTS "idx_workflow_rules_scope_assessment"
  ON "workflow_rules"("scope_assessment_id");

-- 3. crisis_cases — 1:1 with care_episodes. Holds the 5-step checklist state
--    and the supervisor sign-off record.
CREATE TABLE IF NOT EXISTS "crisis_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "episode_id" uuid NOT NULL REFERENCES "care_episodes"("id") ON DELETE CASCADE,
  "candidate_id" uuid REFERENCES "candidate_pool"("id") ON DELETE SET NULL,
  "stage" text NOT NULL DEFAULT 'open',
  "checklist" jsonb NOT NULL DEFAULT '{}',
  "closure_summary" text,
  "supervisor_note" text,
  "signed_off_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "signed_off_at" timestamptz,
  "submitted_for_sign_off_at" timestamptz,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crisis_cases_episode"
  ON "crisis_cases"("episode_id");

CREATE INDEX IF NOT EXISTS "idx_crisis_cases_org_stage"
  ON "crisis_cases"("org_id", "stage");

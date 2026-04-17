-- Phase 14 — Parent self-binding via class invite tokens
--
-- See client/src/features/settings/pages/SchoolClassManagement.tsx (counselor side)
-- and packages/client-portal/src/pages/ParentBindPage.tsx (parent landing page).
--
-- Design: classes share one invite token (teacher generates per-class, posts to
-- WeChat parent group); parents self-bind by entering child name + student id +
-- last 4 digits of their phone (validated against school_student_profiles).

-- 1. Mark guardian-only user accounts (UI-only flag, doesn't change permissions)
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_guardian_account" boolean NOT NULL DEFAULT false;

-- 2. Track who actually signed when a parent signs on behalf of their child
ALTER TABLE "consent_records"
  ADD COLUMN IF NOT EXISTS "signer_on_behalf_of" uuid REFERENCES "users"("id") ON DELETE SET NULL;

-- 3. Per-class parent invite tokens (one token shared by all parents in a class)
CREATE TABLE IF NOT EXISTS "class_parent_invite_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "class_id" uuid NOT NULL REFERENCES "school_classes"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_class_parent_tokens_class"
  ON "class_parent_invite_tokens"("class_id");

-- 4. Parent ↔ child binding records
CREATE TABLE IF NOT EXISTS "client_relationships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "holder_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "related_client_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "relation" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "bound_via_token_id" uuid REFERENCES "class_parent_invite_tokens"("id") ON DELETE SET NULL,
  "accepted_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_client_rel_org_holder_related"
  ON "client_relationships"("org_id", "holder_user_id", "related_client_user_id");

CREATE INDEX IF NOT EXISTS "idx_client_rel_holder"
  ON "client_relationships"("holder_user_id");

CREATE INDEX IF NOT EXISTS "idx_client_rel_related"
  ON "client_relationships"("related_client_user_id");

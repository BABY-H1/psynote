-- Fix: scheme session FK should SET NULL on delete, not RESTRICT
-- This allows updating scheme sessions without breaking group_session_records references
ALTER TABLE "group_session_records"
  DROP CONSTRAINT IF EXISTS "group_session_records_scheme_session_id_group_scheme_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "group_session_records"
  ADD CONSTRAINT "group_session_records_scheme_session_id_group_scheme_sessions_id_fk"
  FOREIGN KEY ("scheme_session_id")
  REFERENCES "group_scheme_sessions"("id")
  ON DELETE SET NULL;

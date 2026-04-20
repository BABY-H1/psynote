/**
 * Migration 023: System-level library alignment.
 *
 * Enables the system administrator's knowledge-base UI to operate on the
 * same 6 resource types as org-scoped users (scales / goals / agreements /
 * schemes / courses / note-templates), by:
 *
 *   1. Allowing `consent_templates.org_id` to be NULL so platform-level
 *      agreement templates can exist without being owned by any org.
 *   2. Adding `allowed_org_ids` distribution column to `consent_templates`
 *      and `note_templates` so the system admin can scope platform-level
 *      templates to a subset of tenants (same pattern as scales/courses/
 *      schemes/goals, which already have this column).
 *
 * Safe to run on a DB with existing data: org-owned rows keep their NOT
 * NULL org_id; only the constraint is relaxed.
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    // ── 1. consent_templates.org_id → nullable ─────────────────────
    await sql.unsafe(`
      ALTER TABLE consent_templates
      ALTER COLUMN org_id DROP NOT NULL
    `);
    console.log('  ✓ consent_templates.org_id is now nullable');

    // ── 2. consent_templates.allowed_org_ids ───────────────────────
    await sql.unsafe(`
      ALTER TABLE consent_templates
      ADD COLUMN IF NOT EXISTS allowed_org_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    console.log('  ✓ consent_templates.allowed_org_ids');

    // ── 3. note_templates.allowed_org_ids ──────────────────────────
    await sql.unsafe(`
      ALTER TABLE note_templates
      ADD COLUMN IF NOT EXISTS allowed_org_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    console.log('  ✓ note_templates.allowed_org_ids');

    console.log('[migration-023] Done — system library alignment columns ready');
  } catch (err) {
    console.error('[migration-023] Failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

/**
 * Migration 024: Add `visibility` column to `consent_templates`.
 *
 * The 6 knowledge-library resources surfaced via `libraryApi()` all need a
 * visibility field so org admins can set an org-internal share scope
 * (`personal` / `organization` / `public`). 5 of 6 already had one; this
 * fills the gap for `consent_templates`.
 *
 * Default is `personal` to match the pattern on `note_templates` /
 * `treatment_goal_library` / `group_schemes`.
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    await sql.unsafe(`
      ALTER TABLE consent_templates
      ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'personal'
    `);
    console.log('  ✓ consent_templates.visibility');

    console.log('[migration-024] Done');
  } catch (err) {
    console.error('[migration-024] Failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

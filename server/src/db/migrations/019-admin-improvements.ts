/**
 * Migration 019: Add allowed_org_ids to content tables for distribution control.
 *
 * Default empty array means NO orgs can see the content.
 * Content must be explicitly assigned to orgs via the admin library UI.
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    const tables = ['scales', 'courses', 'group_schemes', 'note_templates', 'treatment_goal_library'];

    for (const table of tables) {
      await sql.unsafe(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS allowed_org_ids JSONB DEFAULT '[]'`);
      await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_${table}_allowed_org_ids ON ${table} USING GIN (allowed_org_ids)`);
      console.log(`  ✓ ${table}: added allowed_org_ids + GIN index`);
    }

    console.log('[migration-019] Done');
  } catch (err) {
    console.error('[migration-019] Failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

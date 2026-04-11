/**
 * Migration 012: Group assessment config
 *
 * Adds `assessment_config` jsonb column to `group_instances` table.
 * This stores the full lifecycle assessment configuration:
 *   - screening (报名筛查)
 *   - preGroup (入组前测)
 *   - perSession (每节量表, keyed by session number)
 *   - postGroup (结组后测)
 *   - followUp (多轮随访, each with delayDays)
 *   - satisfaction (满意度调查)
 *
 * The existing `recruitment_assessments` and `overall_assessments`
 * columns are preserved for backward compatibility but deprecated.
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    console.log('Starting migration 012: group assessment config...');

    await sql`ALTER TABLE group_instances ADD COLUMN IF NOT EXISTS assessment_config jsonb DEFAULT '{}'::jsonb`;
    console.log('  ✓ Added group_instances.assessment_config');

    console.log('Migration 012 complete.');
  } catch (err) {
    console.error('Migration 012 failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

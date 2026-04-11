/**
 * Migration 013: Course instance extension
 *
 * Adds fields to `course_instances` to align with the group wizard pattern:
 *   - assessment_config (jsonb) — full lifecycle assessment configuration
 *   - location (text) — delivery location (offline address or online meeting info)
 *   - start_date (date) — course start date
 *   - schedule (text) — frequency/schedule description
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    console.log('Starting migration 013: course instance extend...');

    await sql`ALTER TABLE course_instances ADD COLUMN IF NOT EXISTS assessment_config jsonb DEFAULT '{}'::jsonb`;
    console.log('  ✓ Added course_instances.assessment_config');

    await sql`ALTER TABLE course_instances ADD COLUMN IF NOT EXISTS location text`;
    console.log('  ✓ Added course_instances.location');

    await sql`ALTER TABLE course_instances ADD COLUMN IF NOT EXISTS start_date date`;
    console.log('  ✓ Added course_instances.start_date');

    await sql`ALTER TABLE course_instances ADD COLUMN IF NOT EXISTS schedule text`;
    console.log('  ✓ Added course_instances.schedule');

    console.log('Migration 013 complete.');
  } catch (err) {
    console.error('Migration 013 failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

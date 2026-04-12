/**
 * Migration 018: Add last_login_at column to users table.
 *
 * Supports the admin dashboard's "monthly active users" metric.
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    `;
    console.log('[migration-018] Added last_login_at to users table');
  } catch (err) {
    console.error('[migration-018] Failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

/**
 * Migration 016: Add license_key column to organizations.
 *
 * Stores an RSA-signed JWT that determines the org's effective tier,
 * max seats, and feature set. When present and valid, this overrides
 * the plain `plan` column to prevent tier tampering in local deployments.
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    await sql`
      ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS license_key TEXT;
    `;

    console.log('Migration 016: license_key column added to organizations.');
  } catch (err) {
    console.error('Migration 016 failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

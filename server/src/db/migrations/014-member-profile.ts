/**
 * Migration 014: Member profile extension
 *
 * Adds counselor profile fields to `org_members`:
 *   - certifications (jsonb) — professional certificates
 *   - specialties (text[]) — areas of expertise
 *   - max_caseload (int) — maximum concurrent cases
 *   - bio (text) — professional biography
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    await sql`ALTER TABLE org_members ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]'`;
    await sql`ALTER TABLE org_members ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT '{}'`;
    await sql`ALTER TABLE org_members ADD COLUMN IF NOT EXISTS max_caseload INT`;
    await sql`ALTER TABLE org_members ADD COLUMN IF NOT EXISTS bio TEXT`;

    console.log('Migration 014 complete: member profile fields added');
  } finally {
    await sql.end();
  }
}

migrate().catch(console.error);

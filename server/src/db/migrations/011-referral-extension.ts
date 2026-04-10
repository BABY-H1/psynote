/**
 * Migration 011: Phase 9δ — Referral extension
 *
 * Extends the existing `referrals` table with the fields needed for the
 * bidirectional referral flow:
 *   - mode (platform | external)
 *   - to_counselor_id, to_org_id (platform-internal receiver)
 *   - data_package_spec (jsonb) — which records to share
 *   - consented_at, accepted_at, rejected_at, rejection_reason
 *   - download_token, download_expires_at (external mode)
 *
 * The status column gets 3 new state values via documentation only — no
 * enum to migrate, since `status` is a free text column.
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    console.log('Starting migration 011: referral extension...');

    await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'external'`;
    console.log('  ✓ Added referrals.mode');

    await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS to_counselor_id uuid REFERENCES users(id)`;
    await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS to_org_id uuid REFERENCES organizations(id)`;
    console.log('  ✓ Added platform-internal receiver columns');

    await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS data_package_spec jsonb NOT NULL DEFAULT '{}'::jsonb`;
    console.log('  ✓ Added data_package_spec');

    await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS consented_at timestamptz`;
    await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS accepted_at timestamptz`;
    await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS rejected_at timestamptz`;
    await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS rejection_reason text`;
    console.log('  ✓ Added consent timestamps + rejection reason');

    await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS download_token text`;
    await sql`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS download_expires_at timestamptz`;
    console.log('  ✓ Added download token + expiry');

    await sql`CREATE INDEX IF NOT EXISTS idx_referrals_to_counselor ON referrals(to_counselor_id, status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_referrals_to_org ON referrals(to_org_id, status)`;
    console.log('  ✓ Added receiver indexes');

    console.log('Migration 011 complete.');
  } catch (err) {
    console.error('Migration 011 failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

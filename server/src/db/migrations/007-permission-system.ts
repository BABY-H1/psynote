/**
 * Migration 007: Permission system overhaul
 * - Add system_admin flag to users
 * - Add supervisor_id + full_practice_access to org_members
 * - Add supervision workflow fields to session_notes
 * - Create client_assignments table
 * - Create client_access_grants table
 * - Migrate existing data
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    console.log('Starting migration 007: permission system...');

    // 1. users: add system admin flag
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system_admin boolean NOT NULL DEFAULT false`;
    console.log('  ✓ Added is_system_admin to users');

    // 2. org_members: add supervisor + full practice access
    await sql`ALTER TABLE org_members ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES org_members(id)`;
    await sql`ALTER TABLE org_members ADD COLUMN IF NOT EXISTS full_practice_access boolean NOT NULL DEFAULT false`;
    console.log('  ✓ Added supervisor_id and full_practice_access to org_members');

    // 3. session_notes: add supervision workflow fields
    await sql`ALTER TABLE session_notes ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'`;
    await sql`ALTER TABLE session_notes ADD COLUMN IF NOT EXISTS supervisor_annotation text`;
    await sql`ALTER TABLE session_notes ADD COLUMN IF NOT EXISTS submitted_for_review_at timestamptz`;
    console.log('  ✓ Added supervision fields to session_notes');

    // 4. Create client_assignments table
    await sql`
      CREATE TABLE IF NOT EXISTS client_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        client_id uuid NOT NULL REFERENCES users(id),
        counselor_id uuid NOT NULL REFERENCES users(id),
        is_primary boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(org_id, client_id, counselor_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_client_assignments_counselor ON client_assignments(org_id, counselor_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_client_assignments_client ON client_assignments(org_id, client_id)`;
    console.log('  ✓ Created client_assignments table');

    // 5. Create client_access_grants table
    await sql`
      CREATE TABLE IF NOT EXISTS client_access_grants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        client_id uuid NOT NULL REFERENCES users(id),
        granted_to_counselor_id uuid NOT NULL REFERENCES users(id),
        granted_by uuid NOT NULL REFERENCES users(id),
        reason text NOT NULL,
        expires_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(org_id, client_id, granted_to_counselor_id)
      )
    `;
    console.log('  ✓ Created client_access_grants table');

    // 6. Data migration: populate client_assignments from existing care_episodes
    const { count } = await sql`
      WITH inserted AS (
        INSERT INTO client_assignments (org_id, client_id, counselor_id, is_primary)
        SELECT DISTINCT org_id, client_id, counselor_id, true
        FROM care_episodes
        WHERE counselor_id IS NOT NULL
        ON CONFLICT DO NOTHING
        RETURNING 1
      )
      SELECT count(*) AS count FROM inserted
    `;
    console.log(`  ✓ Migrated ${count} client assignments from care_episodes`);

    // 7. Set existing org_admins to full practice access
    await sql`UPDATE org_members SET full_practice_access = true WHERE role = 'org_admin'`;
    console.log('  ✓ Set full_practice_access for existing org_admins');

    console.log('Migration 007 complete!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();

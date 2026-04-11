/**
 * Migration 015: Service intakes
 *
 * Stores consultation requests from potential clients.
 * Public services are configured in organizations.settings.publicServices (JSON).
 * Each intake = one consultation request from a client via the portal.
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS service_intakes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        service_id TEXT NOT NULL,
        client_user_id UUID NOT NULL REFERENCES users(id),
        preferred_counselor_id UUID,
        intake_source TEXT NOT NULL DEFAULT 'org_portal',
        intake_data JSONB DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        assigned_counselor_id UUID,
        assigned_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_service_intakes_org ON service_intakes(org_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_service_intakes_status ON service_intakes(org_id, status)`;

    console.log('Migration 015 complete: service_intakes table created');
  } finally {
    await sql.end();
  }
}

migrate().catch(console.error);

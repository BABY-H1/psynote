/**
 * Migration 026: Role & Authorization Architecture — Phase 1 skeleton.
 *
 * Adds nullable columns & new audit table. Does NOT backfill existing rows,
 * does NOT change any route behavior. See drizzle/0008_role_architecture_skeleton.sql
 * for the full SQL and docs/architecture/role-authorization.md for design.
 *
 * Idempotent — safe to run repeatedly.
 */
import postgres from 'postgres';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    // 1. org_members: role_v2 / principal_class / access_profile
    await sql.unsafe(`
      ALTER TABLE org_members
        ADD COLUMN IF NOT EXISTS role_v2 text
    `);
    await sql.unsafe(`
      ALTER TABLE org_members
        ADD COLUMN IF NOT EXISTS principal_class text
    `);
    await sql.unsafe(`
      ALTER TABLE org_members
        ADD COLUMN IF NOT EXISTS access_profile jsonb
    `);
    console.log('  ✓ org_members.{role_v2, principal_class, access_profile}');

    await sql.unsafe(`
      ALTER TABLE org_members
        DROP CONSTRAINT IF EXISTS ck_org_members_principal_class
    `);
    await sql.unsafe(`
      ALTER TABLE org_members
        ADD CONSTRAINT ck_org_members_principal_class
        CHECK (principal_class IS NULL
            OR principal_class IN ('staff', 'subject', 'proxy'))
    `);
    console.log('  ✓ ck_org_members_principal_class');

    // 2. role_v2 × orgType validation trigger
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION fn_validate_role_v2_vs_org_type()
      RETURNS trigger AS $$
      DECLARE
        v_org_type text;
        v_allowed text[];
      BEGIN
        IF NEW.role_v2 IS NULL THEN
          RETURN NEW;
        END IF;

        SELECT COALESCE(settings->>'orgType', 'counseling')
          INTO v_org_type
          FROM organizations
         WHERE id = NEW.org_id;

        v_allowed := CASE v_org_type
          WHEN 'school' THEN ARRAY[
            'school_admin','school_leader','psychologist',
            'homeroom_teacher','student','parent'
          ]
          WHEN 'counseling' THEN ARRAY[
            'clinic_admin','supervisor','counselor',
            'intern','receptionist','client'
          ]
          WHEN 'enterprise' THEN ARRAY[
            'hr_admin','eap_consultant','employee'
          ]
          WHEN 'solo' THEN ARRAY['owner','client']
          WHEN 'hospital' THEN ARRAY[
            'hospital_admin','attending','resident',
            'nurse','patient','family'
          ]
          ELSE ARRAY[]::text[]
        END;

        IF NOT (NEW.role_v2 = ANY(v_allowed)) THEN
          RAISE EXCEPTION 'role_v2=% 不是 orgType=% 的合法角色',
            NEW.role_v2, v_org_type;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await sql.unsafe(`
      DROP TRIGGER IF EXISTS trg_validate_role_v2 ON org_members
    `);
    await sql.unsafe(`
      CREATE TRIGGER trg_validate_role_v2
        BEFORE INSERT OR UPDATE OF role_v2 ON org_members
        FOR EACH ROW
        EXECUTE FUNCTION fn_validate_role_v2_vs_org_type()
    `);
    console.log('  ✓ trg_validate_role_v2');

    // 3. phi_access_logs: data_class / actor_role_snapshot
    await sql.unsafe(`
      ALTER TABLE phi_access_logs
        ADD COLUMN IF NOT EXISTS data_class text
    `);
    await sql.unsafe(`
      ALTER TABLE phi_access_logs
        ADD COLUMN IF NOT EXISTS actor_role_snapshot text
    `);
    await sql.unsafe(`
      ALTER TABLE phi_access_logs
        DROP CONSTRAINT IF EXISTS ck_phi_access_logs_data_class
    `);
    await sql.unsafe(`
      ALTER TABLE phi_access_logs
        ADD CONSTRAINT ck_phi_access_logs_data_class
        CHECK (data_class IS NULL OR data_class IN (
          'phi_full','phi_summary','de_identified',
          'aggregate','self_only','guardian_scope'
        ))
    `);
    console.log('  ✓ phi_access_logs.{data_class, actor_role_snapshot}');

    // 4. user_role_audit
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS user_role_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action text NOT NULL,
        role_before text,
        role_after text,
        access_profile_before jsonb,
        access_profile_after jsonb,
        actor_id uuid REFERENCES users(id),
        actor_role_snapshot text,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_user_role_audit_org_user
        ON user_role_audit(org_id, user_id, created_at DESC)
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_user_role_audit_actor
        ON user_role_audit(actor_id, created_at DESC)
    `);
    console.log('  ✓ user_role_audit');

    console.log('[migration-026] Done');
  } catch (err) {
    console.error('[migration-026] Failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

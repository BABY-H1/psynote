/**
 * Migration 020: EAP Enterprise — 国央企版支持
 *
 * New tables:
 *   - eap_partnerships: 企业 org ↔ 心理服务机构 org 多对多关系
 *   - eap_employee_profiles: 员工非临床扩展信息（部门、工号等）
 *   - eap_crisis_alerts: 危机预警记录（法定例外显名通知）
 *   - eap_usage_events: 脱敏事件日志（HR 报表的唯一数据源）
 *   - eap_counselor_assignments: 咨询师指派追踪
 *
 * Modified:
 *   - org_members: + source_partnership_id FK
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    // ── 1. eap_partnerships ──────────────────────────────────────────
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS eap_partnerships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        enterprise_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        provider_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'active',
        contract_start TIMESTAMPTZ,
        contract_end TIMESTAMPTZ,
        seat_allocation INTEGER,
        service_scope JSONB NOT NULL DEFAULT '{}',
        notes TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(enterprise_org_id, provider_org_id)
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_eap_partnerships_enterprise ON eap_partnerships(enterprise_org_id, status)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_eap_partnerships_provider ON eap_partnerships(provider_org_id, status)`);
    console.log('  ✓ eap_partnerships');

    // ── 2. eap_counselor_assignments ─────────────────────────────────
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS eap_counselor_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partnership_id UUID NOT NULL REFERENCES eap_partnerships(id) ON DELETE CASCADE,
        counselor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        enterprise_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        provider_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'active',
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        assigned_by UUID REFERENCES users(id),
        removed_at TIMESTAMPTZ,
        UNIQUE(enterprise_org_id, counselor_user_id)
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_eap_assignments_counselor ON eap_counselor_assignments(counselor_user_id, status)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_eap_assignments_enterprise ON eap_counselor_assignments(enterprise_org_id, status)`);
    console.log('  ✓ eap_counselor_assignments');

    // ── 3. eap_employee_profiles ─────────────────────────────────────
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS eap_employee_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        employee_id TEXT,
        department TEXT,
        entry_method TEXT DEFAULT 'link',
        is_anonymous BOOLEAN NOT NULL DEFAULT false,
        registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(org_id, user_id)
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_eap_employees_org_dept ON eap_employee_profiles(org_id, department)`);
    console.log('  ✓ eap_employee_profiles');

    // ── 4. eap_usage_events ──────────────────────────────────────────
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS eap_usage_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        enterprise_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        department TEXT,
        risk_level TEXT,
        provider_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
        metadata JSONB DEFAULT '{}',
        event_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_eap_events_org_type_date ON eap_usage_events(enterprise_org_id, event_type, event_date)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_eap_events_org_dept_date ON eap_usage_events(enterprise_org_id, department, event_date)`);
    console.log('  ✓ eap_usage_events');

    // ── 5. eap_crisis_alerts ─────────────────────────────────────────
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS eap_crisis_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        enterprise_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        employee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        counselor_user_id UUID NOT NULL REFERENCES users(id),
        crisis_type TEXT NOT NULL,
        description TEXT,
        notified_contacts JSONB DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'open',
        resolution_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_eap_crisis_org ON eap_crisis_alerts(enterprise_org_id, status)`);
    console.log('  ✓ eap_crisis_alerts');

    // ── 6. org_members: add source_partnership_id ────────────────────
    await sql.unsafe(`
      ALTER TABLE org_members
      ADD COLUMN IF NOT EXISTS source_partnership_id UUID REFERENCES eap_partnerships(id) ON DELETE SET NULL
    `);
    console.log('  ✓ org_members: added source_partnership_id');

    console.log('[migration-020] Done — EAP Enterprise tables created');
  } catch (err) {
    console.error('[migration-020] Failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

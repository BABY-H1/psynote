/**
 * Migration 030: Counseling 严格合规化 — 删除 intern + receptionist 角色 +
 * 重建 role_v2 trigger。
 *
 * 背景: Phase 1.5 严格合规默认决定 (见 docs/architecture/role-authorization.md
 * §3.2 + browser-walkthrough.md COUNSELING-PERM 条目):
 *   - clinic_admin 默认不读 phi_full(走 access_profile 单点开通)
 *   - intern 角色删除(实习生归并到 counselor + supervisor 督导链)
 *   - receptionist 角色删除(alpha 暂无前台独立运营场景)
 *
 * 本 migration:
 *   1. 把所有 role_v2 = 'intern' 的成员降级为 'counselor'
 *   2. 把所有 role_v2 = 'receptionist' 的成员升级为 'clinic_admin'
 *      (前台一般归属机构管理岗位,无临床数据访问权)
 *   3. 重建 fn_validate_role_v2_vs_org_type trigger 函数,counseling 合法集
 *      变为 ['clinic_admin','supervisor','counselor','client']
 *
 * 幂等。零风险(目前生产 0 条 intern/receptionist 数据)。
 */
import postgres from 'postgres';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    // 1. 迁移现有 intern → counselor
    const internRes = await sql`
      UPDATE org_members
         SET role_v2 = 'counselor',
             updated_at = NOW()
       WHERE role_v2 = 'intern'
       RETURNING id
    `;
    console.log(`  ✓ migrated ${internRes.length} intern → counselor`);

    // 2. 迁移现有 receptionist → clinic_admin
    const recRes = await sql`
      UPDATE org_members
         SET role_v2 = 'clinic_admin',
             updated_at = NOW()
       WHERE role_v2 = 'receptionist'
       RETURNING id
    `;
    console.log(`  ✓ migrated ${recRes.length} receptionist → clinic_admin`);

    // 3. 重建 trigger 函数 — counseling 合法集去掉 intern + receptionist
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
            'clinic_admin','supervisor','counselor','client'
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
    console.log('  ✓ rebuilt fn_validate_role_v2_vs_org_type (counseling: 4 roles)');

    console.log('[migration-030] Done');
  } catch (err) {
    console.error('[migration-030] Failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

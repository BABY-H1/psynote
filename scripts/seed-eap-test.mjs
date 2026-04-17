/**
 * Seed EAP test data for the Phase 14d HRDashboardHome end-to-end test.
 *
 * Goal after run: 中石化工会 HR 主页显示:
 *   - 注册员工 ~12, 本月测评 ~8, 本月咨询 ~3, 本月团辅 ~2, 本月课程 ~1
 *   - 整体风险: L1=6 L2=3 L3=2 L4=1
 *   - 部门矩阵: 技术部 / 销售部 / 市场部 (< 5 人合并为其他)
 *   - 危机预警: 1 条 open
 *   - 新员工待绑定: 2 人（有事件但没完整资料）
 */
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const sql = postgres('postgresql://postgres:psynote123@localhost:5432/psynote');

const ORG_ID = 'ebc15e04-0eec-4918-8faf-a74826101bce'; // 中石化工会

// 12 employees across 4 departments (市场部 triggers k-anonymity < 5)
const EMPLOYEES = [
  { name: '张工', empId: 'E001', dept: '技术部', risk: 'level_1', assessedMonth: true, sessions: 1 },
  { name: '李工', empId: 'E002', dept: '技术部', risk: 'level_1', assessedMonth: true },
  { name: '王工', empId: 'E003', dept: '技术部', risk: 'level_2', assessedMonth: true },
  { name: '赵工', empId: 'E004', dept: '技术部', risk: 'level_3', assessedMonth: true, sessions: 2 },
  { name: '钱工', empId: 'E005', dept: '技术部', risk: 'level_4', assessedMonth: true, hasCrisis: true },

  { name: '孙销', empId: 'S001', dept: '销售部', risk: 'level_1', assessedMonth: true },
  { name: '周销', empId: 'S002', dept: '销售部', risk: 'level_1', assessedMonth: true },
  { name: '吴销', empId: 'S003', dept: '销售部', risk: 'level_2', assessedMonth: true },
  { name: '郑销', empId: 'S004', dept: '销售部', risk: 'level_3' }, // not this month
  { name: '冯销', empId: 'S005', dept: '销售部', risk: 'level_2' }, // not this month

  // 市场部 < 5 people (should merge into "其他" via k-anonymity)
  { name: '陈市', empId: 'M001', dept: '市场部', risk: 'level_1' },
  { name: '褚市', empId: 'M002', dept: '市场部', risk: 'level_1' },

  // 2 employees with usage events but incomplete profiles (for "待绑定" todo)
  { name: '未绑定A', empId: null, dept: null, risk: null, incompleteProfile: true },
  { name: '未绑定B', empId: null, dept: null, risk: null, incompleteProfile: true },
];

async function main() {
  const pwHash = await bcrypt.hash('psynote123', 10);
  let counselorUserId = null;
  const [anyCounselor] = await sql`SELECT user_id FROM org_members WHERE role = 'counselor' LIMIT 1`;
  if (anyCounselor) counselorUserId = anyCounselor.user_id;

  for (const e of EMPLOYEES) {
    const email = (e.empId || `pending-${crypto.randomBytes(4).toString('hex')}`) + '@eap.internal';
    let [u] = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    if (!u) {
      [u] = await sql`INSERT INTO users (id, email, name, password_hash) VALUES (${crypto.randomUUID()}, ${email}, ${e.name}, ${pwHash}) RETURNING id`;
    } else {
      await sql`UPDATE users SET name = ${e.name} WHERE id = ${u.id}`;
    }

    const [mem] = await sql`SELECT id FROM org_members WHERE org_id = ${ORG_ID} AND user_id = ${u.id} LIMIT 1`;
    if (!mem) {
      await sql`INSERT INTO org_members (id, org_id, user_id, role, status) VALUES (${crypto.randomUUID()}, ${ORG_ID}, ${u.id}, 'client', 'active')`;
    }

    const [prof] = await sql`SELECT id FROM eap_employee_profiles WHERE org_id = ${ORG_ID} AND user_id = ${u.id} LIMIT 1`;
    if (!prof && !e.incompleteProfile) {
      await sql`INSERT INTO eap_employee_profiles (id, org_id, user_id, employee_id, department, entry_method, is_anonymous)
                VALUES (${crypto.randomUUID()}, ${ORG_ID}, ${u.id}, ${e.empId}, ${e.dept}, 'import', false)`;
    }
    // Skip creating profile for incomplete ones so 待绑定 todo can fire

    // Assessment event (with risk_level)
    if (e.risk) {
      const eventDate = e.assessedMonth
        ? new Date() // this month
        : new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
      const dateStr = eventDate.toISOString().split('T')[0];
      await sql`INSERT INTO eap_usage_events (id, enterprise_org_id, event_type, user_id, department, risk_level, event_date)
                VALUES (${crypto.randomUUID()}, ${ORG_ID}, 'assessment_completed', ${u.id}, ${e.dept}, ${e.risk}, ${dateStr})`;
    }

    // Session events for a subset
    if (e.sessions) {
      for (let i = 0; i < e.sessions; i++) {
        const offset = i * 3;
        const dateStr = new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        await sql`INSERT INTO eap_usage_events (id, enterprise_org_id, event_type, user_id, department, event_date)
                  VALUES (${crypto.randomUUID()}, ${ORG_ID}, 'session_booked', ${u.id}, ${e.dept}, ${dateStr})`;
        await sql`INSERT INTO eap_usage_events (id, enterprise_org_id, event_type, user_id, department, event_date)
                  VALUES (${crypto.randomUUID()}, ${ORG_ID}, 'session_completed', ${u.id}, ${e.dept}, ${dateStr})`;
      }
    }

    // Group + course participation for the first 2 employees
    if (EMPLOYEES.indexOf(e) < 2) {
      await sql`INSERT INTO eap_usage_events (id, enterprise_org_id, event_type, user_id, department, event_date)
                VALUES (${crypto.randomUUID()}, ${ORG_ID}, 'group_participated', ${u.id}, ${e.dept}, CURRENT_DATE)`;
    }
    if (EMPLOYEES.indexOf(e) === 0) {
      await sql`INSERT INTO eap_usage_events (id, enterprise_org_id, event_type, user_id, department, event_date)
                VALUES (${crypto.randomUUID()}, ${ORG_ID}, 'course_enrolled', ${u.id}, ${e.dept}, CURRENT_DATE)`;
    }

    // Incomplete profile → also seed a usage event so they appear in the 待绑定 set
    if (e.incompleteProfile) {
      await sql`INSERT INTO eap_usage_events (id, enterprise_org_id, event_type, user_id, event_date)
                VALUES (${crypto.randomUUID()}, ${ORG_ID}, 'assessment_completed', ${u.id}, CURRENT_DATE)`;
    }

    // Crisis alert for 钱工 (level_4)
    if (e.hasCrisis && counselorUserId) {
      const [existingAlert] = await sql`SELECT id FROM eap_crisis_alerts WHERE enterprise_org_id = ${ORG_ID} AND employee_user_id = ${u.id} LIMIT 1`;
      if (!existingAlert) {
        await sql`INSERT INTO eap_crisis_alerts (id, enterprise_org_id, employee_user_id, counselor_user_id, crisis_type, description, status)
                  VALUES (${crypto.randomUUID()}, ${ORG_ID}, ${u.id}, ${counselorUserId}, 'self_harm', '测评 L4 + 咨询中发现自伤意念', 'open')`;
      }
    }

    console.log(`seeded ${e.name} (${e.dept || '—'}) risk=${e.risk || '—'}`);
  }

  console.log('\n=== SEED DONE ===');
  console.log('Login enterprise org_admin → /hr 主页');
  console.log('Org: 中石化工会', ORG_ID);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

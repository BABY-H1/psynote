/**
 * Seed varied assessment_results + students + a few crisis candidates for the
 * Phase 14c SchoolDashboard end-to-end test in the 渝北中学 school org.
 *
 * Goal after running: SchoolDashboard should show non-zero numbers in every
 * section (8 core tiles + class×risk matrix + crisis 5-card row).
 */
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const sql = postgres('postgresql://postgres:psynote123@localhost:5432/psynote');

const ORG_ID = '17d1f90e-2da8-4734-9470-9f377f2ecdd0'; // 渝北中学

// 10 students distributed across 3 classes with varied risk levels
const STUDENTS = [
  // 高一(3)班 — already has 李华, 李 now + 4 others
  { name: '李华', studentId: '20240301', grade: '高一', className: '3班', risk: 'level_3' },  // existing
  { name: '王明', studentId: '20240302', grade: '高一', className: '3班', risk: 'level_4' },
  { name: '张晓', studentId: '20240303', grade: '高一', className: '3班', risk: 'level_2' },
  { name: '刘佳', studentId: '20240304', grade: '高一', className: '3班', risk: 'level_1' },
  { name: '陈鑫', studentId: '20240305', grade: '高一', className: '3班', risk: 'level_1' },

  // 高一(1)班
  { name: '周宁', studentId: '20240101', grade: '高一', className: '1班', risk: 'level_3' },
  { name: '吴涵', studentId: '20240102', grade: '高一', className: '1班', risk: 'level_2' },
  { name: '黄玥', studentId: '20240103', grade: '高一', className: '1班', risk: 'level_1' },

  // 高二(1)班
  { name: '林晨', studentId: '20230101', grade: '高二', className: '1班', risk: 'level_4' },
  { name: '徐敏', studentId: '20230102', grade: '高二', className: '1班', risk: 'level_1' },
];

const RISK_TO_TOTAL = { level_1: 3, level_2: 9, level_3: 14, level_4: 19 };

async function main() {
  // Ensure the 3 classes exist
  for (const [grade, className] of [['高一', '3班'], ['高一', '1班'], ['高二', '1班']]) {
    const [existing] = await sql`SELECT id FROM school_classes WHERE org_id = ${ORG_ID} AND grade = ${grade} AND class_name = ${className} LIMIT 1`;
    if (!existing) {
      await sql`INSERT INTO school_classes (id, org_id, grade, class_name) VALUES (${crypto.randomUUID()}, ${ORG_ID}, ${grade}, ${className})`;
      console.log(`created class ${grade} ${className}`);
    }
  }

  const pwHash = await bcrypt.hash('psynote123', 10);

  // Create student users + profiles
  for (const s of STUDENTS) {
    const email = `${s.studentId}@student.internal`;
    let [u] = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    if (!u) {
      [u] = await sql`
        INSERT INTO users (id, email, name, password_hash)
        VALUES (${crypto.randomUUID()}, ${email}, ${s.name}, ${pwHash})
        RETURNING id`;
    } else {
      // Update name in case it drifted
      await sql`UPDATE users SET name = ${s.name} WHERE id = ${u.id}`;
    }

    const [mem] = await sql`SELECT id FROM org_members WHERE org_id = ${ORG_ID} AND user_id = ${u.id} LIMIT 1`;
    if (!mem) {
      await sql`INSERT INTO org_members (id, org_id, user_id, role, status) VALUES (${crypto.randomUUID()}, ${ORG_ID}, ${u.id}, 'client', 'active')`;
    }

    const [prof] = await sql`SELECT id FROM school_student_profiles WHERE org_id = ${ORG_ID} AND user_id = ${u.id} LIMIT 1`;
    if (!prof) {
      await sql`INSERT INTO school_student_profiles (org_id, user_id, student_id, grade, class_name, parent_name, parent_phone, entry_method)
                VALUES (${ORG_ID}, ${u.id}, ${s.studentId}, ${s.grade}, ${s.className}, '家长', '13800138888', 'import')`;
    } else {
      await sql`UPDATE school_student_profiles SET grade = ${s.grade}, class_name = ${s.className}, student_id = ${s.studentId} WHERE id = ${prof.id}`;
    }

    // Create an assessment_result with this risk level (most recent)
    // We need an existing assessment_id. Try to find any assessment in this org; fallback to any
    let [ass] = await sql`SELECT id FROM assessments WHERE org_id = ${ORG_ID} LIMIT 1`;
    if (!ass) {
      [ass] = await sql`SELECT id FROM assessments LIMIT 1`;
    }
    if (!ass) {
      console.log('No assessments found, skipping result insert for', s.name);
      continue;
    }

    // Pick a scale_id for this assessment if needed (nullable column)
    // The key fields are: user_id, org_id, risk_level, total_score, created_at
    const totalScore = RISK_TO_TOTAL[s.risk];
    await sql`
      INSERT INTO assessment_results (id, org_id, assessment_id, user_id, risk_level, total_score, answers, dimension_scores, client_visible, created_at)
      VALUES (${crypto.randomUUID()}, ${ORG_ID}, ${ass.id}, ${u.id}, ${s.risk}, ${totalScore}, '{}'::jsonb, '{}'::jsonb, true, now())
    `;
    console.log(`seeded ${s.name} (${s.grade} ${s.className}) risk=${s.risk}`);
  }

  // Seed a crisis candidate (pending, not accepted) so 待处置 tile shows non-zero
  const [wangMing] = await sql`SELECT u.id FROM users u WHERE u.email = '20240302@student.internal' LIMIT 1`;
  if (wangMing) {
    const [existingCandidate] = await sql`
      SELECT id FROM candidate_pool
      WHERE org_id = ${ORG_ID} AND client_user_id = ${wangMing.id} AND status = 'pending'
      LIMIT 1`;
    if (!existingCandidate) {
      await sql`
        INSERT INTO candidate_pool (id, org_id, kind, client_user_id, status, priority, reason, suggestion, created_at)
        VALUES (${crypto.randomUUID()}, ${ORG_ID}, 'crisis_candidate', ${wangMing.id}, 'pending', 100, '测评总分 19，自评焦虑严重', '建议立即跟进危机处置', now())
      `;
      console.log('seeded 1 crisis_candidate pending (王明)');
    } else {
      console.log('crisis_candidate already exists');
    }
  }

  // Print summary
  console.log('\n=== SEED DONE ===');
  console.log('Login ybzx@psynote.cn / admin123 → 主页 SchoolDashboard');
  console.log('Expect:');
  console.log('  本月完成测评 = 10 人次');
  console.log('  L1 健康 = 4, L2 关注 = 2, L3 建议 = 2, L4 紧急 = 2');
  console.log('  班级矩阵: 高一(3)班 / 高一(1)班 / 高二(1)班 均有数据');
  console.log('  危机处置 待处置 = 1 (crisis candidate pending)');
  console.log('  年级分布: 高一 ~8 人, 高二 ~2 人');

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

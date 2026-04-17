/**
 * Seed test data for Phase 14 parent-binding end-to-end testing.
 *
 * - Creates a school org if none exists with school feature
 * - Creates 1 class (高一(3)班)
 * - Creates 1 student user (李华, studentId 20240301) with parent_phone 13800138888
 * - Reports: orgId, classId, the student name/number/phone-last-4 + the
 *   counselor login email so I can run the test in the browser.
 */
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const sql = postgres('postgresql://postgres:psynote123@localhost:5432/psynote');

async function main() {
  // Find a school org (one we can use for testing)
  let [org] = await sql`
    SELECT id, name, slug, settings->>'orgType' as org_type
    FROM organizations
    WHERE settings->>'orgType' = 'school'
    LIMIT 1
  `;
  if (!org) {
    console.log('No school org found; using first org and ensuring it has school type...');
    [org] = await sql`SELECT id, name, slug FROM organizations LIMIT 1`;
    await sql`UPDATE organizations SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{orgType}', '"school"') WHERE id = ${org.id}`;
  }
  console.log('Using org:', org.id, org.name);

  // Find or create a class
  let [cls] = await sql`
    SELECT id, grade, class_name FROM school_classes
    WHERE org_id = ${org.id} AND grade = '高一' AND class_name = '3班'
    LIMIT 1
  `;
  if (!cls) {
    [cls] = await sql`
      INSERT INTO school_classes (org_id, grade, class_name)
      VALUES (${org.id}, '高一', '3班')
      RETURNING id, grade, class_name
    `;
    console.log('Created class:', cls.id);
  } else {
    console.log('Reusing class:', cls.id);
  }

  // Find or create student user 李华 with studentId 20240301
  const studentEmail = '20240301@student.internal';
  let [studentUser] = await sql`SELECT id FROM users WHERE email = ${studentEmail} LIMIT 1`;
  if (!studentUser) {
    const pwHash = await bcrypt.hash('psynote123', 10);
    [studentUser] = await sql`
      INSERT INTO users (id, email, name, password_hash)
      VALUES (${crypto.randomUUID()}, ${studentEmail}, '李华', ${pwHash})
      RETURNING id
    `;
    console.log('Created student user:', studentUser.id);
  } else {
    console.log('Reusing student user:', studentUser.id);
  }

  // Ensure org_member as client
  const [existingMember] = await sql`
    SELECT id FROM org_members WHERE org_id = ${org.id} AND user_id = ${studentUser.id} LIMIT 1
  `;
  if (!existingMember) {
    await sql`
      INSERT INTO org_members (org_id, user_id, role, status)
      VALUES (${org.id}, ${studentUser.id}, 'client', 'active')
    `;
    console.log('Added student as client of org');
  }

  // Ensure school_student_profiles row with parent_phone
  const [existingProfile] = await sql`
    SELECT id FROM school_student_profiles
    WHERE org_id = ${org.id} AND user_id = ${studentUser.id}
    LIMIT 1
  `;
  if (!existingProfile) {
    await sql`
      INSERT INTO school_student_profiles
        (org_id, user_id, student_id, grade, class_name, parent_name, parent_phone, parent_email, entry_method)
      VALUES
        (${org.id}, ${studentUser.id}, '20240301', '高一', '3班', '李母', '13800138888', null, 'import')
    `;
    console.log('Created school_student_profiles row');
  } else {
    await sql`
      UPDATE school_student_profiles
      SET grade = '高一', class_name = '3班', student_id = '20240301',
          parent_name = '李母', parent_phone = '13800138888'
      WHERE id = ${existingProfile.id}
    `;
    console.log('Updated existing student profile');
  }

  // Print test bundle summary
  console.log('\n=== TEST DATA READY ===');
  console.log('Org:        ', org.id, org.name);
  console.log('Class:      ', cls.id, cls.grade, cls.class_name);
  console.log('Student:    ', studentUser.id, '李华 (学号 20240301)');
  console.log('Parent phone last4:  8888');
  console.log('\n→ Now log in as a counselor for this org and use 设置 → 学校管理 to');
  console.log('  generate the class invite token, then test the /invite/:token URL.');

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

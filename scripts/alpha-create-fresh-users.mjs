// Alpha test helper — create 3 fresh users with no org membership / data.
// User A is system admin (can access /admin/tenants/new).
// User B + C are vanilla users (you can invite them, self-register them as
// clients into orgs, use them to test parent-binding via class code, etc.).
//
// Run inside container: docker compose exec app node /app/create-fresh-users.mjs
import bcrypt from 'bcryptjs';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);
const password = 'test123456';
const hash = await bcrypt.hash(password, 10);

const users = [
  {
    email: 'a@test.psynote.cn',
    name: '测试用户 A (系统管理员)',
    isSystemAdmin: true,
  },
  {
    email: 'b@test.psynote.cn',
    name: '测试用户 B',
    isSystemAdmin: false,
  },
  {
    email: 'c@test.psynote.cn',
    name: '测试用户 C',
    isSystemAdmin: false,
  },
];

console.log('Creating 3 fresh users (no org membership, no data)...\n');

for (const u of users) {
  // Upsert: insert if not exists, else update. ON CONFLICT (email) since email is unique.
  const [row] = await sql`
    INSERT INTO users (email, name, password_hash, is_system_admin)
    VALUES (${u.email}, ${u.name}, ${hash}, ${u.isSystemAdmin})
    ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash,
          is_system_admin = EXCLUDED.is_system_admin
    RETURNING id, email, is_system_admin
  `;
  const tag = row.is_system_admin ? '👑 SYSTEM ADMIN' : '   plain user';
  console.log(`${tag}  ${row.email}  (id: ${row.id})`);
}

console.log(`\nAll users have password: '${password}'`);
console.log('A 可登录 /admin/tenants/new 创建机构。');
console.log('B / C 没有任何 org 关联,可在机构创建后被邀请或自行注册成 client。');

await sql.end();

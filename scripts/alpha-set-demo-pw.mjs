// Alpha test helper — set password 'demo123456' for the 3 demo users created by seed.ts.
// Not committed to production; just so 1-2 testers can log in.
import bcrypt from 'bcryptjs';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);
const password = 'demo123456';
const hash = await bcrypt.hash(password, 10);

const emails = [
  'counselor@demo.psynote.cn',
  'client@demo.psynote.cn',
  'admin@demo.psynote.cn',
];

const rows = await sql`
  UPDATE users
  SET password_hash = ${hash}
  WHERE email = ANY(${emails})
  RETURNING email, name
`;

console.log(`Set password '${password}' for ${rows.length} users:`);
for (const r of rows) console.log(`  - ${r.email} (${r.name})`);

await sql.end();

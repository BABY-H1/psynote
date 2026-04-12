import postgres from 'postgres';
import bcrypt from 'bcryptjs';

async function main() {
  const sql = postgres('postgresql://postgres:psynote123@localhost:5432/psynote');
  const hash = await bcrypt.hash('admin123', 10);
  const result = await sql`UPDATE users SET password_hash = ${hash} WHERE email = 'admin@demo.psynote.cn'`;
  console.log('Updated rows:', result.count);
  await sql.end();
}
main();

import postgres from 'postgres';

const sql = postgres('postgresql://postgres:psynote123@localhost:5432/psynote');

async function main() {
  const rows = await sql`SELECT id, email, name, is_system_admin FROM users WHERE is_system_admin = true OR email LIKE '%admin%'`;
  console.log(JSON.stringify(rows, null, 2));
  await sql.end();
}

main();

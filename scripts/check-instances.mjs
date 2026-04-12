import postgres from 'postgres';
const sql = postgres('postgresql://postgres:psynote123@localhost:5432/psynote');
const rows = await sql`SELECT id, title, status FROM group_instances ORDER BY created_at DESC LIMIT 5`;
for (const r of rows) {
  console.log(`${r.title} | ${r.status} | ${r.id.substring(0,8)}`);
}
await sql.end();
process.exit(0);

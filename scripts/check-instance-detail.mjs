import postgres from 'postgres';
const sql = postgres('postgresql://postgres:psynote123@localhost:5432/psynote');
const rows = await sql`SELECT id, title, status, leader_id, created_by FROM group_instances WHERE title = '压力管理单次工作坊'`;
for (const r of rows) {
  console.log(JSON.stringify(r));
}
await sql.end();
process.exit(0);

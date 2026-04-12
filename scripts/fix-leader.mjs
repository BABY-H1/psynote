import postgres from 'postgres';
const sql = postgres('postgresql://postgres:psynote123@localhost:5432/psynote');
const result = await sql`UPDATE group_instances SET leader_id = created_by WHERE leader_id IS NULL AND created_by IS NOT NULL`;
console.log('Fixed', result.count, 'instances');
await sql.end();
process.exit(0);

import postgres from 'postgres';
const sql = postgres('postgresql://postgres:psynote123@localhost:5432/psynote');
const r1 = await sql`DELETE FROM org_members WHERE org_id IN (SELECT id FROM organizations WHERE slug IN ('xinyuxingchen', 'xinyu-xingchen'))`;
console.log('Deleted members:', r1.count);
const r2 = await sql`DELETE FROM organizations WHERE slug IN ('xinyuxingchen', 'xinyu-xingchen')`;
console.log('Deleted orgs:', r2.count);
await sql.end();

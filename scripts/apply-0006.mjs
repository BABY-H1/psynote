import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'server', 'drizzle', '0006_parent_binding.sql');

const sql = postgres('postgresql://postgres:psynote123@localhost:5432/psynote');
const ddl = readFileSync(sqlPath, 'utf-8');
try {
  await sql.unsafe(ddl);
  console.log('OK: 0006_parent_binding.sql applied');

  const rels = await sql`SELECT to_regclass('public.client_relationships')::text AS t`;
  const tokens = await sql`SELECT to_regclass('public.class_parent_invite_tokens')::text AS t`;
  const userCol = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='is_guardian_account'`;
  const consentCol = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='consent_records' AND column_name='signer_on_behalf_of'`;
  console.log('client_relationships table:', rels[0].t);
  console.log('class_parent_invite_tokens table:', tokens[0].t);
  console.log('users.is_guardian_account column:', userCol.length ? 'yes' : 'no');
  console.log('consent_records.signer_on_behalf_of column:', consentCol.length ? 'yes' : 'no');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
} finally {
  await sql.end();
}

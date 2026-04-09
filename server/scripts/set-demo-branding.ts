/**
 * One-off script used during Phase 7 regression testing. With no arguments it
 * resets the demo org's branding to empty, cleaning up after a verification
 * run. Pass `--populate` to seed a demo logo + theme + header/footer (used to
 * verify the sidebar logo replacement under the counselor session, since the
 * HTTP PATCH endpoint requires org_admin role).
 *
 * Usage:
 *   npx tsx server/scripts/set-demo-branding.ts            # clear branding
 *   npx tsx server/scripts/set-demo-branding.ts --populate # set demo values
 *
 * Safe to delete after Phase 7 verification is complete.
 */
import 'dotenv/config';
import postgres from 'postgres';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function main() {
  const populate = process.argv.includes('--populate');
  const sql = postgres(DATABASE_URL);

  const [counselor] = await sql`
    SELECT id FROM users WHERE email = 'counselor@demo.psynote.cn' LIMIT 1
  `;
  if (!counselor) {
    console.error('no counselor user found');
    process.exit(1);
  }
  const [member] = await sql`
    SELECT org_id FROM org_members WHERE user_id = ${counselor.id} LIMIT 1
  `;
  if (!member) {
    console.error('no org membership for counselor');
    process.exit(1);
  }
  const orgId = member.org_id;

  const [org] = await sql`
    SELECT settings FROM organizations WHERE id = ${orgId} LIMIT 1
  `;
  const prevSettings = (org?.settings as any) ?? {};

  let nextSettings: any;
  if (populate) {
    nextSettings = {
      ...prevSettings,
      branding: {
        logoUrl: 'https://placehold.co/120x32/6366f1/white/png?text=Psynote',
        themeColor: '#6366f1',
        reportHeader: 'Psynote 演示机构 · 个案测评报告',
        reportFooter: '本报告仅供内部使用，未经授权不得外传。',
      },
    };
    console.log('↑ setting demo branding for org', orgId);
  } else {
    // Remove the branding sub-object entirely
    const { branding: _dropped, ...rest } = prevSettings;
    void _dropped;
    nextSettings = rest;
    console.log('× clearing branding for org', orgId);
  }

  await sql`
    UPDATE organizations
    SET settings = ${sql.json(nextSettings)}, updated_at = NOW()
    WHERE id = ${orgId}
  `;

  console.log('✓ done');
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

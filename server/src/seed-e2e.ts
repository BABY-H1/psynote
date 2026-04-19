/**
 * E2E seed script — bootstraps a fresh-or-existing DB with the 8 roles used
 * by the Playwright smoke suite (see e2e/fixtures/accounts.ts).
 *
 * Idempotent: all INSERTs use deterministic UUIDs + ON CONFLICT DO UPDATE for
 * password hashes, so re-running is safe.
 *
 *   npm run test:e2e:seed             # against $DATABASE_URL
 *   DATABASE_URL=postgres://... npm run test:e2e:seed
 *
 * What this creates:
 *   - 1 system admin user
 *   - 1 counseling org (3 roles: org_admin / counselor / client)
 *   - 1 enterprise org (org_admin = EAP 负责人)
 *   - 1 school org (org_admin = 学校管理员)
 *   - 1 solo org (org_admin = 独立咨询师)
 *
 * Password for all accounts: `admin123` (bcrypt-hashed).
 *
 * This runs independently of server/src/seed.ts (which builds richer clinical
 * data for the counseling demo org). You can run them in either order — both
 * are idempotent and reference the same demo org by deterministic UUID.
 */
import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://postgres:psynote123@localhost:5432/psynote';
const sql = postgres(DATABASE_URL);

/** Deterministic UUID generator — same name → same UUID. Safe across runs. */
function demoUUID(name: string): string {
  return crypto.createHash('md5').update(`psynote-e2e-${name}`).digest('hex')
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

// Share these UUIDs with server/src/seed.ts so that both seeders target the
// SAME counseling demo org (seed.ts already uses `psynote-demo-org`).
// For that one we replicate the demo-prefix so the UUID collides intentionally.
function demoPrefixUUID(name: string): string {
  return crypto.createHash('md5').update(`psynote-demo-${name}`).digest('hex')
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

const PASSWORD = 'admin123';

// ─── Orgs ──────────────────────────────────────────────────────────

const ORG = {
  // Shared with server/src/seed.ts (same UUID)
  counseling: { id: demoPrefixUUID('org'), name: 'Psynote演示机构',   slug: 'demo',       plan: 'pro',     orgType: 'counseling' },
  enterprise: { id: demoUUID('eap-demo'),  name: 'EAP 演示企业',      slug: 'eap-demo',   plan: 'pro',     orgType: 'enterprise' },
  school:     { id: demoUUID('school-demo'), name: '演示学校',        slug: 'school-demo', plan: 'pro',    orgType: 'school' },
  solo:       { id: demoUUID('solo-demo'), name: '独立咨询师工作室', slug: 'solo-demo',  plan: 'free',    orgType: 'solo' },
};

// ─── Users (role × org matrix) ────────────────────────────────────

interface SeedUser {
  id: string;
  email: string;
  name: string;
  isSystemAdmin?: boolean;
}

const USERS: Record<string, SeedUser> = {
  // System admin — no org membership
  sysadmin: {
    id: demoUUID('sysadmin'),
    email: 'sysadmin@psynote.cn',
    name: '系统管理员',
    isSystemAdmin: true,
  },
  // Counseling org (reuses seed.ts IDs for admin/counselor/client)
  counselingAdmin: {
    id: demoPrefixUUID('admin'),
    email: 'admin@demo.psynote.cn',
    name: '王管理员',
  },
  counselingCounselor: {
    id: demoPrefixUUID('counselor'),
    email: 'counselor@demo.psynote.cn',
    name: '张咨询师',
  },
  counselingClient: {
    id: demoPrefixUUID('client'),
    email: 'client@demo.psynote.cn',
    name: '李同学',
  },
  // Enterprise org
  enterpriseHR: {
    id: demoUUID('enterprise-hr'),
    email: 'hr@sinopec-eap.com',
    name: '企业 EAP 负责人',
  },
  // School org
  schoolAdmin: {
    id: demoUUID('school-admin'),
    email: 'ybzx@psynote.cn',
    name: '学校管理员',
  },
  // Solo org
  soloOwner: {
    id: demoUUID('solo-owner'),
    email: 'solo@demo.psynote.cn',
    name: '独立咨询师',
  },
};

interface SeedMembership {
  role: 'org_admin' | 'counselor' | 'client';
}

// Memberships are declared inline inside seedE2E() because they need to
// reference ids resolved at runtime (existing rows may live under different
// UUIDs than the deterministic ones).

// ─── Run ──────────────────────────────────────────────────────────

async function seedE2E() {
  console.log('Seeding E2E fixtures to', DATABASE_URL);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // Strategy: for each target row we look up by its *natural key* (org.slug /
  // user.email / org_members.(org_id, user_id)) first. If a row exists, we
  // keep its pre-existing id and only overwrite the fields we care about. If
  // not, we insert using our deterministic demoUUID as id. This makes the
  // seed safe to run against a DB that already has users/orgs created via
  // other means (seed.ts / admin UI / reset-*-pw scripts).

  // 1. Organizations — match by slug (unique). Remember actual ids for later.
  const orgIds: Record<string, string> = {};
  for (const [key, o] of Object.entries(ORG)) {
    const settings = JSON.stringify({ orgType: o.orgType, maxMembers: 100 });
    const existing = await sql<{ id: string }[]>`SELECT id FROM organizations WHERE slug = ${o.slug} LIMIT 1`;
    if (existing.length) {
      orgIds[key] = existing[0].id;
      // Canonical overwrite of settings is fine for demo orgs — E2E owns them
      // end-to-end. Avoids jsonb_set failing when an existing row has a scalar
      // or null in settings (observed on at least one legacy demo org).
      await sql`
        UPDATE organizations
        SET plan = ${o.plan},
            name = ${o.name},
            settings = ${settings}::jsonb
        WHERE id = ${existing[0].id}
      `;
    } else {
      orgIds[key] = o.id;
      await sql`
        INSERT INTO organizations (id, name, slug, plan, settings)
        VALUES (${o.id}, ${o.name}, ${o.slug}, ${o.plan}, ${settings}::jsonb)
      `;
    }
  }
  console.log(`  + ${Object.keys(ORG).length} organizations (orgType set in settings)`);

  // 2. Users — match by email (unique). Remember actual ids for memberships.
  const userIds: Record<string, string> = {};
  for (const [key, u] of Object.entries(USERS)) {
    const existing = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${u.email} LIMIT 1`;
    if (existing.length) {
      userIds[key] = existing[0].id;
      await sql`
        UPDATE users
        SET password_hash   = ${passwordHash},
            name            = ${u.name},
            is_system_admin = ${u.isSystemAdmin ?? false}
        WHERE id = ${existing[0].id}
      `;
    } else {
      userIds[key] = u.id;
      await sql`
        INSERT INTO users (id, email, name, password_hash, is_system_admin)
        VALUES (${u.id}, ${u.email}, ${u.name}, ${passwordHash}, ${u.isSystemAdmin ?? false})
      `;
    }
  }
  console.log(`  + ${Object.keys(USERS).length} users (password = admin123)`);

  // Build org_id → key and user_id → key remaps so memberships can reference
  // the RESOLVED ids (which may differ from our deterministic UUIDs).
  const memberships: {
    orgKey: keyof typeof ORG;
    userKey: keyof typeof USERS;
    role: SeedMembership['role'];
    fullPracticeAccess: boolean;
  }[] = [
    { orgKey: 'counseling', userKey: 'counselingAdmin',      role: 'org_admin',  fullPracticeAccess: true },
    { orgKey: 'counseling', userKey: 'counselingCounselor',  role: 'counselor',  fullPracticeAccess: false },
    { orgKey: 'counseling', userKey: 'counselingClient',     role: 'client',     fullPracticeAccess: false },
    { orgKey: 'enterprise', userKey: 'enterpriseHR',         role: 'org_admin',  fullPracticeAccess: false },
    { orgKey: 'school',     userKey: 'schoolAdmin',          role: 'org_admin',  fullPracticeAccess: true },
    { orgKey: 'solo',       userKey: 'soloOwner',            role: 'org_admin',  fullPracticeAccess: true },
  ];

  // 3. Memberships — match by (org_id, user_id) unique index.
  for (const m of memberships) {
    const orgId = orgIds[m.orgKey];
    const userId = userIds[m.userKey];
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM org_members WHERE org_id = ${orgId} AND user_id = ${userId} LIMIT 1
    `;
    if (existing.length) {
      await sql`
        UPDATE org_members
        SET role                 = ${m.role},
            status               = 'active',
            full_practice_access = ${m.fullPracticeAccess}
        WHERE id = ${existing[0].id}
      `;
    } else {
      await sql`
        INSERT INTO org_members (org_id, user_id, role, status, full_practice_access)
        VALUES (${orgId}, ${userId}, ${m.role}, 'active', ${m.fullPracticeAccess})
      `;
    }
  }
  console.log(`  + ${memberships.length} memberships`);

  console.log('\n--- E2E seed completed ---');
  console.log('Accounts (all passwords = admin123):');
  for (const u of Object.values(USERS)) {
    const note = u.isSystemAdmin ? '  [system admin]' : '';
    console.log(`  ${u.email.padEnd(30)} ${u.name}${note}`);
  }
  console.log('\nOrgs:');
  for (const [key, o] of Object.entries(ORG)) {
    console.log(`  ${key.padEnd(12)} → ${o.name} (orgType=${o.orgType}, plan=${o.plan})`);
  }

  await sql.end();
}

seedE2E().catch((err) => {
  console.error('E2E seed failed:', err);
  process.exit(1);
});

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
  // Phase-A.2 — guardian impersonation E2E fixtures
  parentBound: {
    id: demoUUID('parent-bound'),
    email: 'parent-bound@demo.psynote.cn',
    name: '李妈妈',
  },
  parentUnbound: {
    id: demoUUID('parent-unbound'),
    email: 'parent-unbound@demo.psynote.cn',
    name: '路人甲',
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
  // Phase-B.3d — parent invite-token binding E2E fixtures
  schoolStudent: {
    id: demoUUID('school-student'),
    email: 'zhangsan@demo.psynote.cn',
    name: '张三',
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
    { orgKey: 'counseling', userKey: 'parentBound',          role: 'client',     fullPracticeAccess: false },
    { orgKey: 'counseling', userKey: 'parentUnbound',        role: 'client',     fullPracticeAccess: false },
    { orgKey: 'enterprise', userKey: 'enterpriseHR',         role: 'org_admin',  fullPracticeAccess: false },
    { orgKey: 'school',     userKey: 'schoolAdmin',          role: 'org_admin',  fullPracticeAccess: true },
    { orgKey: 'school',     userKey: 'schoolStudent',        role: 'client',     fullPracticeAccess: false },
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

  // 4. Parent-binding (client_relationships) — for Phase-A.2 guardian
  //    impersonation E2E. `parentBound` holds an active relation to
  //    `counselingClient`; `parentUnbound` holds no relationship at all.
  const bindings: Array<{
    holderKey: keyof typeof USERS;
    relatedKey: keyof typeof USERS;
    orgKey: keyof typeof ORG;
    relation: string;
  }> = [
    { holderKey: 'parentBound', relatedKey: 'counselingClient', orgKey: 'counseling', relation: 'guardian' },
  ];
  for (const b of bindings) {
    const orgId = orgIds[b.orgKey];
    const holderId = userIds[b.holderKey];
    const relatedId = userIds[b.relatedKey];
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM client_relationships
      WHERE org_id = ${orgId}
        AND holder_user_id = ${holderId}
        AND related_client_user_id = ${relatedId}
      LIMIT 1
    `;
    if (existing.length) {
      await sql`
        UPDATE client_relationships
        SET status = 'active',
            relation = ${b.relation},
            revoked_at = NULL
        WHERE id = ${existing[0].id}
      `;
    } else {
      await sql`
        INSERT INTO client_relationships (org_id, holder_user_id, related_client_user_id, relation, status)
        VALUES (${orgId}, ${holderId}, ${relatedId}, ${b.relation}, 'active')
      `;
    }
  }
  console.log(`  + ${bindings.length} parent-binding relationships`);

  // 5. School invite-binding fixtures (Phase-B.3d) — one class + one student
  //    profile + one active invite token in the school org. The happy path
  //    E2E uses these to exercise the full /api/public/parent-bind/:token
  //    flow (preview → submit with 3-field match → new parent user + JWT).
  const schoolOrgId = orgIds['school'];
  const schoolAdminId = userIds['schoolAdmin'];
  const schoolStudentId = userIds['schoolStudent'];

  // 5.1 class (match by unique index: org_id + grade + class_name)
  const GRADE = '七年级';
  const CLASS_NAME = '一班';
  const existingClass = await sql<{ id: string }[]>`
    SELECT id FROM school_classes
    WHERE org_id = ${schoolOrgId} AND grade = ${GRADE} AND class_name = ${CLASS_NAME}
    LIMIT 1
  `;
  let classId: string;
  if (existingClass.length) {
    classId = existingClass[0].id;
    await sql`
      UPDATE school_classes
      SET homeroom_teacher_id = ${schoolAdminId}
      WHERE id = ${classId}
    `;
  } else {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO school_classes (org_id, grade, class_name, homeroom_teacher_id, student_count)
      VALUES (${schoolOrgId}, ${GRADE}, ${CLASS_NAME}, ${schoolAdminId}, 1)
      RETURNING id
    `;
    classId = row.id;
  }

  // 5.2 student profile — the 3 anti-impersonation fields are studentId,
  // user.name, and phoneLast4 of parentPhone. Pin the phone so the E2E
  // can assert on 138-0000-9988 → last4 '9988'.
  const STUDENT_ID = 'S2026001';
  const PARENT_PHONE = '13800009988';
  const existingProfile = await sql<{ id: string }[]>`
    SELECT id FROM school_student_profiles
    WHERE org_id = ${schoolOrgId} AND user_id = ${schoolStudentId}
    LIMIT 1
  `;
  if (existingProfile.length) {
    await sql`
      UPDATE school_student_profiles
      SET student_id = ${STUDENT_ID},
          grade = ${GRADE},
          class_name = ${CLASS_NAME},
          parent_phone = ${PARENT_PHONE},
          entry_method = 'import'
      WHERE id = ${existingProfile[0].id}
    `;
  } else {
    await sql`
      INSERT INTO school_student_profiles (org_id, user_id, student_id, grade, class_name, parent_phone, entry_method)
      VALUES (${schoolOrgId}, ${schoolStudentId}, ${STUDENT_ID}, ${GRADE}, ${CLASS_NAME}, ${PARENT_PHONE}, 'import')
    `;
  }

  // 5.3 active invite token — pinned (not random) so E2E can build the URL
  //     without querying the DB. Expires far in the future; revoked_at=NULL.
  const INVITE_TOKEN = 'e2e-school-invite-token-fixed-2026';
  const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const existingTok = await sql<{ id: string }[]>`
    SELECT id FROM class_parent_invite_tokens WHERE token = ${INVITE_TOKEN} LIMIT 1
  `;
  if (existingTok.length) {
    await sql`
      UPDATE class_parent_invite_tokens
      SET org_id = ${schoolOrgId},
          class_id = ${classId},
          created_by = ${schoolAdminId},
          expires_at = ${future},
          revoked_at = NULL
      WHERE id = ${existingTok[0].id}
    `;
  } else {
    await sql`
      INSERT INTO class_parent_invite_tokens (org_id, class_id, token, created_by, expires_at)
      VALUES (${schoolOrgId}, ${classId}, ${INVITE_TOKEN}, ${schoolAdminId}, ${future})
    `;
  }
  console.log('  + 1 school class + 1 student profile + 1 active invite token');

  // 6. Minimal self-contained assessment fixture (Phase-B.3b).
  //    The client-self-assessment E2E submits to POST /api/orgs/:orgId/results
  //    which needs a scale + dimension + items + assessment chain. The full
  //    seed.ts creates a 9-item PHQ-9, but in CI we run drizzle-kit push +
  //    seed-e2e only (no seed.ts), so seed this minimal 2-item scale here
  //    with deterministic UUIDs the spec can reference directly.
  const MINI = {
    scaleId:      demoUUID('e2e-scale-mini'),
    dimId:        demoUUID('e2e-dim-0'),
    item0Id:      demoUUID('e2e-item-0'),
    item1Id:      demoUUID('e2e-item-1'),
    assessmentId: demoUUID('e2e-assessment-mini'),
  };
  const counselorId = userIds['counselingCounselor'];
  const countOrgId = orgIds['counseling'];
  const miniOpts = JSON.stringify([
    { label: '否', value: 0 },
    { label: '是', value: 1 },
  ]);
  await sql`
    INSERT INTO scales (id, org_id, title, description, instructions, scoring_mode, created_by, is_public)
    VALUES (${MINI.scaleId}, ${countOrgId}, 'E2E 迷你量表', 'E2E smoke test fixture', '请如实作答', 'sum', ${counselorId}, false)
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
  `;
  await sql`
    INSERT INTO scale_dimensions (id, scale_id, name, description, calculation_method, sort_order)
    VALUES (${MINI.dimId}, ${MINI.scaleId}, '总分', 'single dimension', 'sum', 0)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO scale_items (id, scale_id, dimension_id, text, is_reverse_scored, options, sort_order)
    VALUES (${MINI.item0Id}, ${MINI.scaleId}, ${MINI.dimId}, '题 1', false, ${miniOpts}::jsonb, 0)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO scale_items (id, scale_id, dimension_id, text, is_reverse_scored, options, sort_order)
    VALUES (${MINI.item1Id}, ${MINI.scaleId}, ${MINI.dimId}, '题 2', false, ${miniOpts}::jsonb, 1)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO assessments (id, org_id, title, description, is_active, created_by)
    VALUES (${MINI.assessmentId}, ${countOrgId}, 'E2E 迷你测评', 'E2E smoke test assessment', true, ${counselorId})
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO assessment_scales (assessment_id, scale_id, sort_order)
    VALUES (${MINI.assessmentId}, ${MINI.scaleId}, 0)
    ON CONFLICT DO NOTHING
  `;
  console.log('  + E2E mini scale (2 items) + assessment (B.3b)');

  // 7. Rate-limit bump for E2E.
  // Fastify's global rate limiter reads `limits.rateLimitMax` from
  // system_config at boot (default 100/min). A full Playwright run does
  // setup (7 logins) + smoke (~36 tests, many with pooled logins + ~3-5
  // requests each) in under 60s → saturates the 100/min budget and
  // starts 429-ing partway through. This was invisible on dev machines
  // after a one-off manual SQL bump; CI starts from a fresh DB so the
  // default kicks in and trips the suite. We settle the bump in seed
  // so both local and CI stay in sync.
  await sql`
    INSERT INTO system_config (category, key, value, description, requires_restart)
    VALUES ('limits', 'rateLimitMax', '500'::jsonb, '每分钟最大请求数 (E2E seed)', true)
    ON CONFLICT (category, key) DO UPDATE
      SET value = '500'::jsonb
  `;
  console.log('  + system_config.limits.rateLimitMax = 500 (E2E smoke headroom)');

  // 8. Phase J — research-triage dispatch e2e fixtures.
  //
  // Spec: e2e/smoke/triage-dispatch-counselor.spec.ts walks the path
  //   counselor → /research-triage → click 李同学 row → 点 "课程"
  //   → pick "E2E 演示课程" → toast "已报名到".
  //
  // To make that work deterministically we need:
  //   8.1 client_assignment   — so dataScopeGuard ('assigned') admits
  //                              the counselor to the client's result
  //   8.2 assessment_result   — one filled-out mini assessment for 李同学,
  //                              riskLevel='level_3' so it lands in the
  //                              "严重" bucket and the candidate row is
  //                              visible without an L-level filter
  //   8.3 course + instance   — InstancePicker filters out
  //                              closed/archived/completed; status='active'
  //                              keeps "E2E 演示课程" eligible
  //
  // All idempotent: lookup-by-natural-key first, only insert if missing.

  // 8.1 client_assignment — counselor 张咨询师 ← → 来访者 李同学
  const counselingClientId = userIds['counselingClient'];
  const existingAssn = await sql<{ id: string }[]>`
    SELECT id FROM client_assignments
    WHERE org_id = ${countOrgId}
      AND client_id = ${counselingClientId}
      AND counselor_id = ${counselorId}
    LIMIT 1
  `;
  if (!existingAssn.length) {
    await sql`
      INSERT INTO client_assignments (org_id, client_id, counselor_id, is_primary)
      VALUES (${countOrgId}, ${counselingClientId}, ${counselorId}, true)
    `;
  }
  console.log('  + 1 client_assignment (counselor ↔ 李同学)');

  // 8.2 assessment_result — 李同学 已完成 e2e mini 量表, level_3.
  //     answers / dimension_scores 用最小合法 jsonb (notNull 约束).
  const TRIAGE_RESULT_ID = demoUUID('e2e-triage-result');
  const triageAnswers = JSON.stringify({
    [MINI.item0Id]: 1,
    [MINI.item1Id]: 1,
  });
  const triageDimScores = JSON.stringify({
    [MINI.dimId]: 2,
  });
  const triageRecommendations = JSON.stringify([
    {
      title: '加入认知行为团辅',
      rationale: '总分偏高，建议进入团辅小组',
      suggestedAction: '推荐 8 周 CBT 团辅课程',
    },
  ]);
  // Phase K — AI 合规水印. seed 一份固定 provenance 让 dev 环境
  // 直接能看到 <AIBadge /> 在 detail panel 的"AI 解读" / "AI 建议"
  // 旁边渲染. 真实跑过 AI 的 result 由 triage-automation.service.ts
  // 写入 (model 取自 env.AI_MODEL).
  const triageProvenance = JSON.stringify({
    aiGenerated: true,
    aiModel: 'e2e-stub-model',
    aiPipeline: 'triage-auto',
    aiGeneratedAt: '2026-04-29T10:00:00.000Z',
    aiConfidence: 0.86,
  });
  const existingTriageResult = await sql<{ id: string }[]>`
    SELECT id FROM assessment_results WHERE id = ${TRIAGE_RESULT_ID} LIMIT 1
  `;
  if (!existingTriageResult.length) {
    await sql`
      INSERT INTO assessment_results (
        id, org_id, assessment_id, user_id,
        answers, dimension_scores, total_score, risk_level,
        ai_interpretation, recommendations, ai_provenance, created_by
      )
      VALUES (
        ${TRIAGE_RESULT_ID}, ${countOrgId}, ${MINI.assessmentId}, ${counselingClientId},
        ${triageAnswers}::jsonb, ${triageDimScores}::jsonb, '2', 'level_3',
        '中度风险，建议 1-2 周内安排面谈', ${triageRecommendations}::jsonb,
        ${triageProvenance}::jsonb, ${counselingClientId}
      )
    `;
  } else {
    // Re-running seed should resync the level + provenance so the spec
    // is stable even if a prior run mutated risk_level via the override
    // route or the column existed but was nulled.
    await sql`
      UPDATE assessment_results
      SET risk_level = 'level_3',
          recommendations = ${triageRecommendations}::jsonb,
          ai_provenance = ${triageProvenance}::jsonb
      WHERE id = ${TRIAGE_RESULT_ID}
    `;
  }
  console.log('  + 1 assessment_result (李同学, level_3, mini 量表)');

  // 8.3 course + course_instance — picker 渲染源.
  const COURSE_ID = demoUUID('e2e-course');
  const COURSE_INSTANCE_ID = demoUUID('e2e-course-instance');
  const existingCourse = await sql<{ id: string }[]>`
    SELECT id FROM courses WHERE id = ${COURSE_ID} LIMIT 1
  `;
  if (!existingCourse.length) {
    await sql`
      INSERT INTO courses (
        id, org_id, title, description, status, creation_mode, created_by
      )
      VALUES (
        ${COURSE_ID}, ${countOrgId}, 'E2E 演示课程蓝本',
        'E2E 派单 happy path 课程蓝本',
        'published', 'manual', ${counselorId}
      )
    `;
  }
  const existingCi = await sql<{ id: string }[]>`
    SELECT id FROM course_instances WHERE id = ${COURSE_INSTANCE_ID} LIMIT 1
  `;
  if (!existingCi.length) {
    await sql`
      INSERT INTO course_instances (
        id, org_id, course_id, title, description,
        publish_mode, status, capacity, created_by
      )
      VALUES (
        ${COURSE_INSTANCE_ID}, ${countOrgId}, ${COURSE_ID}, 'E2E 演示课程',
        'E2E 派单 happy path 实例', 'assign', 'active', 20, ${counselorId}
      )
    `;
  } else {
    // Same idempotent re-sync — keep status 'active' so the picker shows it.
    await sql`
      UPDATE course_instances
      SET status = 'active', title = 'E2E 演示课程'
      WHERE id = ${COURSE_INSTANCE_ID}
    `;
  }
  console.log('  + 1 course + 1 active course_instance (E2E 演示课程)');

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

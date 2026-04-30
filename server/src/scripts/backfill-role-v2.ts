/**
 * Backfill script: populate org_members.role_v2 / principal_class /
 * access_profile for every existing row, based on (orgType, legacyRole,
 * isGuardianAccount, hasStudentProfile, fullPracticeAccess, supervisorId,
 * hasSupervisees).
 *
 * Phase 1 ships this script WITHOUT running it. Phase 2 will run against
 * staging + production after smoke tests.
 *
 * Design: pure mapping function `computeRoleV2ForMember()` is fully unit
 * tested; DB wrapper reads every org_members row, computes, writes. Rows
 * with `requiresReview=true` are logged to a file (or a future
 * `migration_pending` table) for human review — NOT auto-applied.
 *
 * Usage (Phase 2):
 *   DATABASE_URL=... npx tsx server/src/scripts/backfill-role-v2.ts [--apply]
 *     without --apply: dry run, prints plan
 *     with --apply:   updates DB
 */

import type { OrgType, RoleV2, Principal } from '@psynote/shared';
import { legacyRoleToV2, principalOf } from '@psynote/shared';

// ─── Pure mapping ─────────────────────────────────────────────────

export interface BackfillInput {
  orgType: OrgType;
  legacyRole: 'org_admin' | 'counselor' | 'client';
  isGuardianAccount: boolean;
  /** 是否存在 schoolStudentProfiles 行 */
  hasStudentProfile: boolean;
  fullPracticeAccess: boolean;
  supervisorId: string | null;
  /** 是否有下属(其他 org_members.supervisorId === this.id) */
  hasSupervisees: boolean;
}

export interface BackfillResult {
  roleV2: RoleV2;
  principalClass: Principal;
  accessProfile: Record<string, unknown>;
  /** 该推导是否需要人工复核(保守默认 + 信息不全的场景) */
  requiresReview: boolean;
  /** 备注:推导理由/异常 */
  reason: string;
}

export function computeRoleV2ForMember(input: BackfillInput): BackfillResult {
  const { orgType, legacyRole } = input;

  // ─── 咨询中心 counselor 的督导分流 ────────────────────────
  // fullPracticeAccess=true 或 hasSupervisees=true 一律推为 supervisor。
  // 这两条之一成立就表明业务上此人已经承担督导职责,架构上把隐性 flag 升级为显性角色。
  if (orgType === 'counseling' && legacyRole === 'counselor') {
    if (input.fullPracticeAccess || input.hasSupervisees) {
      return ok('supervisor', 'counselor_with_fpa_or_supervisees');
    }
    return ok('counselor', 'plain_counselor');
  }

  // ─── 学校 client 的 guardian vs student 分流 ─────────────
  if (orgType === 'school' && legacyRole === 'client') {
    if (input.isGuardianAccount) {
      return ok('parent', 'guardian_account');
    }
    if (input.hasStudentProfile) {
      return ok('student', 'has_student_profile');
    }
    // 既非监护人又无 studentProfile —— 历史数据缺失,保守默认为 student 并标记 review
    return {
      roleV2: 'student',
      principalClass: 'subject',
      accessProfile: {},
      requiresReview: true,
      reason: 'school_client_no_student_profile_defaulted_to_student',
    };
  }

  // ─── 其他情况走 legacyRoleToV2 的标准推导 ─────────────────
  const roleV2 = legacyRoleToV2(orgType, legacyRole, {
    isGuardianAccount: input.isGuardianAccount,
  });
  return ok(roleV2, 'default_mapping');
}

function ok(roleV2: RoleV2, reason: string): BackfillResult {
  return {
    roleV2,
    principalClass: principalOf(roleV2),
    accessProfile: {},
    requiresReview: false,
    reason,
  };
}

// ─── CLI wrapper (Phase 2 runs this) ──────────────────────────────

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(
    apply
      ? '[backfill-role-v2] APPLY mode — will write to DB'
      : '[backfill-role-v2] DRY RUN — use --apply to commit',
  );

  // Lazy imports so the pure module stays DB-free for unit tests
  const postgresMod = await import('postgres');
  const postgres = postgresMod.default;
  const DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://postgres:psynote123@localhost:5432/psynote';
  const sql = postgres(DATABASE_URL);

  try {
    // 读取每个成员 + 所属 org 的 orgType + guardian flag + studentProfile 存在性 + 下属数量
    const rows = await sql<
      Array<{
        member_id: string;
        user_id: string;
        org_id: string;
        role: 'org_admin' | 'counselor' | 'client';
        role_v2: string | null;
        full_practice_access: boolean;
        supervisor_id: string | null;
        is_guardian_account: boolean;
        org_type: OrgType;
        has_student_profile: boolean;
        supervisee_count: number;
      }>
    >`
      SELECT
        om.id              AS member_id,
        om.user_id         AS user_id,
        om.org_id          AS org_id,
        om.role            AS role,
        om.role_v2         AS role_v2,
        om.full_practice_access AS full_practice_access,
        om.supervisor_id   AS supervisor_id,
        u.is_guardian_account AS is_guardian_account,
        COALESCE(o.settings->>'orgType', 'counseling')::text AS org_type,
        EXISTS (
          SELECT 1 FROM school_student_profiles ssp
           WHERE ssp.user_id = om.user_id AND ssp.org_id = om.org_id
        ) AS has_student_profile,
        (
          SELECT COUNT(*)::int FROM org_members ch
           WHERE ch.supervisor_id = om.id
             AND ch.status = 'active'
        ) AS supervisee_count
      FROM org_members om
      JOIN users u ON u.id = om.user_id
      JOIN organizations o ON o.id = om.org_id
      WHERE om.status = 'active'
        AND om.role_v2 IS NULL
    `;

    console.log(`[backfill-role-v2] ${rows.length} members to backfill`);
    let applied = 0;
    const reviewQueue: Array<{
      memberId: string;
      orgId: string;
      userId: string;
      input: BackfillInput;
      result: BackfillResult;
    }> = [];

    for (const row of rows) {
      const input: BackfillInput = {
        orgType: row.org_type,
        legacyRole: row.role,
        isGuardianAccount: row.is_guardian_account,
        hasStudentProfile: row.has_student_profile,
        fullPracticeAccess: row.full_practice_access,
        supervisorId: row.supervisor_id,
        hasSupervisees: row.supervisee_count > 0,
      };
      const result = computeRoleV2ForMember(input);

      if (result.requiresReview) {
        reviewQueue.push({
          memberId: row.member_id,
          orgId: row.org_id,
          userId: row.user_id,
          input,
          result,
        });
      }

      if (apply) {
        await sql`
          UPDATE org_members
             SET role_v2 = ${result.roleV2},
                 principal_class = ${result.principalClass},
                 access_profile = ${JSON.stringify(result.accessProfile)}::jsonb
           WHERE id = ${row.member_id}
        `;
        applied++;
      }
    }

    console.log(`[backfill-role-v2] ${applied} rows ${apply ? 'updated' : 'would-be-updated'}`);
    console.log(`[backfill-role-v2] ${reviewQueue.length} rows flagged for review`);
    if (reviewQueue.length > 0) {
      console.log('───── REVIEW QUEUE ─────');
      for (const r of reviewQueue) {
        console.log(
          `  [${r.orgId}] member=${r.memberId} user=${r.userId} → ${r.result.roleV2} (${r.result.reason})`,
        );
      }
    }
    console.log('[backfill-role-v2] Done');
  } catch (err) {
    console.error('[backfill-role-v2] Failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Only run if invoked directly
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  main();
}

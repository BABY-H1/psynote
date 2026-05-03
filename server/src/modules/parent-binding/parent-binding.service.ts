/**
 * Parent self-binding service — Phase 14.
 *
 * Two flows in one module:
 *
 *  1. Counselor side (`createClassToken` / `listClassTokens` / `revokeClassToken`)
 *     Generates a per-class invite token; teacher posts the URL to a parent
 *     WeChat group. The token is shared by ALL parents in the same class.
 *
 *  2. Public landing (`getTokenPreview` / `bind`)
 *     Parent opens the URL in any browser, sees the school + class name (no
 *     student list — preview is intentionally lean), then submits:
 *       - studentName     孩子姓名
 *       - studentNumber   学号
 *       - phoneLast4      家长本人手机后 4 位
 *       - relation        与孩子关系
 *       - myName          家长姓名
 *       - password        登录密码
 *     We verify all 3 student-identifying fields against
 *     `school_student_profiles` SCOPED BY `class_id`. ALL THREE must match
 *     (防止冒认陌生学生). On success we create the guardian user, add them
 *     to the org as `client`, write the `client_relationships` row, mint a
 *     JWT, and return the bundle in `/auth/login`-compatible shape.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, and, sql as drizzleSql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import {
  classParentInviteTokens,
  clientRelationships,
  schoolClasses,
  schoolStudentProfiles,
  organizations,
  orgMembers,
  users,
} from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import type {
  ParentRelation,
  ParentBindTokenPreview,
  ParentBindResponse,
  MyChildEntry,
} from '@psynote/shared';

// env.ts validates JWT_SECRET is ≥ 32 chars at startup. No fallback here.
const JWT_SECRET = env.JWT_SECRET;

const VALID_RELATIONS: ParentRelation[] = ['father', 'mother', 'guardian', 'other'];

const RELATION_LABELS: Record<ParentRelation, string> = {
  father: '父亲',
  mother: '母亲',
  guardian: '监护人',
  other: '其他',
};

// ─── Counselor side ─────────────────────────────────────────────

export async function createClassToken(input: {
  orgId: string;
  classId: string;
  createdBy: string;
  expiresInDays?: number;
}) {
  const expiresInDays = input.expiresInDays ?? 30;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  // Verify class belongs to org
  const [cls] = await db
    .select({ id: schoolClasses.id })
    .from(schoolClasses)
    .where(and(eq(schoolClasses.id, input.classId), eq(schoolClasses.orgId, input.orgId)))
    .limit(1);
  if (!cls) throw new NotFoundError('SchoolClass', input.classId);

  const token = crypto.randomBytes(24).toString('base64url');

  const [row] = await db
    .insert(classParentInviteTokens)
    .values({
      orgId: input.orgId,
      classId: input.classId,
      token,
      createdBy: input.createdBy,
      expiresAt,
    })
    .returning();

  return row;
}

export async function listClassTokens(orgId: string, classId: string) {
  return db
    .select()
    .from(classParentInviteTokens)
    .where(and(
      eq(classParentInviteTokens.orgId, orgId),
      eq(classParentInviteTokens.classId, classId),
    ))
    .orderBy(drizzleSql`${classParentInviteTokens.createdAt} DESC`);
}

export async function revokeClassToken(orgId: string, tokenId: string) {
  const [row] = await db
    .select()
    .from(classParentInviteTokens)
    .where(and(
      eq(classParentInviteTokens.id, tokenId),
      eq(classParentInviteTokens.orgId, orgId),
    ))
    .limit(1);
  if (!row) throw new NotFoundError('ClassParentInviteToken', tokenId);

  const [updated] = await db
    .update(classParentInviteTokens)
    .set({ revokedAt: new Date() })
    .where(eq(classParentInviteTokens.id, tokenId))
    .returning();
  return updated;
}

// ─── Public side ────────────────────────────────────────────────

async function loadValidToken(token: string) {
  const [row] = await db
    .select({
      tokenRow: classParentInviteTokens,
      className: schoolClasses.className,
      classGrade: schoolClasses.grade,
      orgName: organizations.name,
    })
    .from(classParentInviteTokens)
    .innerJoin(schoolClasses, eq(schoolClasses.id, classParentInviteTokens.classId))
    .innerJoin(organizations, eq(organizations.id, classParentInviteTokens.orgId))
    .where(eq(classParentInviteTokens.token, token))
    .limit(1);

  if (!row) throw new NotFoundError('邀请链接无效或已撤销');
  if (row.tokenRow.revokedAt) throw new ValidationError('邀请链接已被撤销');
  if (row.tokenRow.expiresAt.getTime() < Date.now()) throw new ValidationError('邀请链接已过期');

  return row;
}

export async function getTokenPreview(token: string): Promise<ParentBindTokenPreview> {
  const row = await loadValidToken(token);
  return {
    orgName: row.orgName,
    className: row.className,
    classGrade: row.classGrade,
    expiresAt: row.tokenRow.expiresAt.toISOString(),
  };
}

function signTokens(user: { id: string; email: string | null; isSystemAdmin?: boolean | null }) {
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, isSystemAdmin: user.isSystemAdmin ?? false },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '30d' },
  );
  return { accessToken, refreshToken };
}

export async function bind(input: {
  token: string;
  studentName: string;
  studentNumber: string;
  phoneLast4: string;
  relation: ParentRelation;
  myName: string;
  password: string;
}): Promise<ParentBindResponse> {
  // ── Validate inputs ───────────────────────────────────────────
  if (!input.studentName?.trim()) throw new ValidationError('请填写孩子姓名');
  if (!input.studentNumber?.trim()) throw new ValidationError('请填写学号');
  if (!/^\d{4}$/.test(input.phoneLast4 || '')) {
    throw new ValidationError('请填写您手机号的后 4 位（4 个数字）');
  }
  if (!VALID_RELATIONS.includes(input.relation)) {
    throw new ValidationError('请选择与孩子的关系');
  }
  if (!input.myName?.trim()) throw new ValidationError('请填写您的姓名');
  if (!input.password || input.password.length < 6) {
    throw new ValidationError('登录密码至少 6 位');
  }

  const tokenRow = await loadValidToken(input.token);
  const orgId = tokenRow.tokenRow.orgId;
  const classId = tokenRow.tokenRow.classId;

  // ── Find matching student in this class ───────────────────────
  // ALL THREE fields must match: student_id + user.name + last4 of parent_phone
  const matches = await db
    .select({
      studentUserId: schoolStudentProfiles.userId,
      studentName: users.name,
      studentNumber: schoolStudentProfiles.studentId,
      parentPhone: schoolStudentProfiles.parentPhone,
    })
    .from(schoolStudentProfiles)
    .innerJoin(users, eq(users.id, schoolStudentProfiles.userId))
    .innerJoin(schoolClasses, and(
      eq(schoolClasses.grade, schoolStudentProfiles.grade),
      eq(schoolClasses.className, schoolStudentProfiles.className),
      eq(schoolClasses.orgId, schoolStudentProfiles.orgId),
    ))
    .where(and(
      eq(schoolStudentProfiles.orgId, orgId),
      eq(schoolClasses.id, classId),
      eq(schoolStudentProfiles.studentId, input.studentNumber.trim()),
      eq(users.name, input.studentName.trim()),
    ))
    .limit(2);

  if (matches.length === 0) {
    throw new ValidationError('信息核对失败，请联系班主任确认孩子姓名/学号');
  }
  if (matches.length > 1) {
    // Should never happen given uq_school_students_org_user, but be defensive
    throw new ValidationError('信息核对失败：匹配到多名学生，请联系老师');
  }

  const match = matches[0];
  const recordedPhone = (match.parentPhone || '').replace(/\D/g, '');
  if (!recordedPhone || recordedPhone.slice(-4) !== input.phoneLast4) {
    throw new ValidationError('信息核对失败，手机号后 4 位与老师录入的不一致');
  }

  const childUserId = match.studentUserId;

  // ── Find or create the guardian user ──────────────────────────
  // Guardian users get a synthetic email so we can keep the existing email-based
  // login path working; they should normally log in via /parent-bind landing
  // again or via portal /login if they remember the email + password.
  const guardianEmail = `g_${crypto.randomBytes(6).toString('hex')}@guardian.internal`;
  const passwordHash = await bcrypt.hash(input.password, 10);

  const [guardianUser] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: guardianEmail,
      name: input.myName.trim(),
      passwordHash,
      isGuardianAccount: true,
    })
    .returning();

  // Add as 'client' role member of the org
  await db.insert(orgMembers).values({
    orgId,
    userId: guardianUser.id,
    role: 'client',
    status: 'active',
  });

  // ── Check if relationship already exists (defensive — shouldn't, since
  //    we just made a brand-new guardian user, but unique constraint protects). ──
  const [existing] = await db
    .select()
    .from(clientRelationships)
    .where(and(
      eq(clientRelationships.orgId, orgId),
      eq(clientRelationships.holderUserId, guardianUser.id),
      eq(clientRelationships.relatedClientUserId, childUserId),
    ))
    .limit(1);

  let relationshipRow = existing;
  if (!relationshipRow) {
    const [created] = await db
      .insert(clientRelationships)
      .values({
        orgId,
        holderUserId: guardianUser.id,
        relatedClientUserId: childUserId,
        relation: input.relation,
        status: 'active',
        boundViaTokenId: tokenRow.tokenRow.id,
      })
      .returning();
    relationshipRow = created;
  }

  // ── Mint JWT ──────────────────────────────────────────────────
  const tokens = signTokens(guardianUser);

  return {
    ...tokens,
    user: {
      id: guardianUser.id,
      email: guardianUser.email,
      name: guardianUser.name,
      isSystemAdmin: guardianUser.isSystemAdmin,
    },
    orgId,
    child: {
      id: childUserId,
      name: match.studentName,
      relation: input.relation,
    },
  };
}

// ─── My children (portal — for "我的孩子" page + identity switcher) ──

export async function listMyChildren(holderUserId: string, orgId: string): Promise<MyChildEntry[]> {
  const rows = await db
    .select({
      relationshipId: clientRelationships.id,
      childUserId: clientRelationships.relatedClientUserId,
      childName: users.name,
      relation: clientRelationships.relation,
      status: clientRelationships.status,
      acceptedAt: clientRelationships.acceptedAt,
    })
    .from(clientRelationships)
    .innerJoin(users, eq(users.id, clientRelationships.relatedClientUserId))
    .where(and(
      eq(clientRelationships.holderUserId, holderUserId),
      eq(clientRelationships.orgId, orgId),
      eq(clientRelationships.status, 'active'),
    ))
    .orderBy(clientRelationships.acceptedAt);

  return rows.map((r) => ({
    relationshipId: r.relationshipId,
    childUserId: r.childUserId,
    childName: r.childName,
    relation: (r.relation as ParentRelation),
    status: 'active',
    acceptedAt: r.acceptedAt.toISOString(),
  }));
}

export async function revokeRelationship(holderUserId: string, relationshipId: string) {
  const [row] = await db
    .select()
    .from(clientRelationships)
    .where(eq(clientRelationships.id, relationshipId))
    .limit(1);
  if (!row) throw new NotFoundError('ClientRelationship', relationshipId);
  if (row.holderUserId !== holderUserId) {
    // Caller is not the holder — refuse silently to avoid leaking existence
    throw new NotFoundError('ClientRelationship', relationshipId);
  }
  if (row.status !== 'active') {
    return row; // already revoked, idempotent
  }
  const [updated] = await db
    .update(clientRelationships)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(clientRelationships.id, relationshipId))
    .returning();
  return updated;
}

/**
 * Check if a holder has an active relationship with a target client user.
 * Used by `client.routes.ts`'s `resolveTargetUserId` helper to gate `?as=` queries.
 */
export async function hasActiveRelationship(opts: {
  orgId: string;
  holderUserId: string;
  relatedClientUserId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: clientRelationships.id })
    .from(clientRelationships)
    .where(and(
      eq(clientRelationships.orgId, opts.orgId),
      eq(clientRelationships.holderUserId, opts.holderUserId),
      eq(clientRelationships.relatedClientUserId, opts.relatedClientUserId),
      eq(clientRelationships.status, 'active'),
    ))
    .limit(1);
  return !!row;
}

export { RELATION_LABELS };

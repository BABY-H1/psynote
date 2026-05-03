/**
 * Counseling Public Routes —— 咨询中心 C 端自助注册 (无需 auth)
 *
 * 挂在 /api/public/counseling 下。流程 mirror eap-public.routes.ts,
 * 差别在 orgType 的校验(只暴露 counseling 机构,防止跨 orgType 越权)。
 *
 * 路由:
 *   GET  /:orgSlug/info      获取机构基本信息(name/logo/主题色)
 *   POST /:orgSlug/register  注册成来访者 + 建 org_members(client) + clientProfile
 *
 * ⚠️ 当前路径**无审核流程** —— 任何人填 orgSlug + 邮箱 + 密码就能成为该机构
 * 的 client。alpha 用户已确认接受。production 需在此前加 "请求注册 → admin
 * 审核" 门(参考 group enrollment 的 approval 模式)或 CAPTCHA + 邮箱验证。
 */
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  organizations,
  orgMembers,
  users,
  clientProfiles,
} from '../../db/schema.js';
import { ValidationError, NotFoundError, UnauthorizedError } from '../../lib/errors.js';
import { env } from '../../config/env.js';

const JWT_SECRET = env.JWT_SECRET;

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

function isCounselingOrg(settings: unknown): boolean {
  const s = (settings || {}) as Record<string, unknown>;
  return s.orgType === 'counseling';
}

export async function counselingPublicRoutes(app: FastifyInstance) {
  // ─── Org 基本信息 ────────────────────────────────────────────
  app.get('/:orgSlug/info', async (request) => {
    const { orgSlug } = request.params as { orgSlug: string };

    const [org] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        settings: organizations.settings,
      })
      .from(organizations)
      .where(eq(organizations.slug, orgSlug))
      .limit(1);

    if (!org || !isCounselingOrg(org.settings)) {
      // 返回 404 不暴露 orgSlug 是否存在但不是 counseling 类
      throw new NotFoundError('Organization not found');
    }

    const settings = (org.settings || {}) as Record<string, any>;
    const branding = settings.branding || {};

    return {
      name: org.name,
      slug: org.slug,
      logoUrl: branding.logoUrl || null,
      themeColor: branding.themeColor || null,
    };
  });

  // ─── 来访者自助注册 ──────────────────────────────────────────
  app.post('/:orgSlug/register', async (request, reply) => {
    const { orgSlug } = request.params as { orgSlug: string };
    const body = (request.body ?? {}) as {
      name?: string;
      email?: string;
      password?: string;
      phone?: string;
    };

    if (!body.name?.trim() || !body.email?.trim() || !body.password) {
      throw new ValidationError('姓名、邮箱和密码不能为空');
    }
    if (body.password.length < 6) {
      throw new ValidationError('密码至少 6 位');
    }

    const [org] = await db
      .select({
        id: organizations.id,
        settings: organizations.settings,
      })
      .from(organizations)
      .where(eq(organizations.slug, orgSlug))
      .limit(1);

    if (!org || !isCounselingOrg(org.settings)) {
      throw new NotFoundError('Organization not found');
    }

    const email = body.email.trim().toLowerCase();

    // 看 user 是否已存在
    const [existingUser] = await db
      .select({
        id: users.id,
        email: users.email,
        isSystemAdmin: users.isSystemAdmin,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let userRow: { id: string; email: string | null; isSystemAdmin: boolean | null };
    let isNewUser = false;

    if (existingUser) {
      // W0.4 安全审计修复 (2026-05-03):
      // 之前此处直接 userRow = existingUser 然后签 token,任何知道 email + orgSlug
      // 的人都能登入对应账户。现在分两种情形:
      //   - existingUser.passwordHash 非空 → 必须 bcrypt.compare 验密码 (防接管)
      //   - existingUser.passwordHash 为空 → 用户尚未设密码(可能由课程公开报名 /
      //     家长邀请等流程预创建过 user 行),此次注册视为 claim 账户,设新密码
      if (existingUser.passwordHash) {
        const valid = await bcrypt.compare(body.password, existingUser.passwordHash);
        if (!valid) {
          throw new UnauthorizedError('邮箱或密码错误');
        }
      } else {
        const newHash = await bcrypt.hash(body.password, 10);
        await db
          .update(users)
          .set({ passwordHash: newHash, name: body.name.trim() })
          .where(eq(users.id, existingUser.id));
      }
      userRow = {
        id: existingUser.id,
        email: existingUser.email,
        isSystemAdmin: existingUser.isSystemAdmin,
      };
    } else {
      const passwordHash = await bcrypt.hash(body.password, 10);
      const [newUser] = await db.insert(users).values({
        email,
        name: body.name.trim(),
        passwordHash,
      }).returning();
      userRow = {
        id: newUser.id,
        email: newUser.email,
        isSystemAdmin: newUser.isSystemAdmin,
      };
      isNewUser = true;
    }

    // 看是否已是本 org 成员
    const [existingMember] = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(and(
        eq(orgMembers.orgId, org.id),
        eq(orgMembers.userId, userRow.id),
      ))
      .limit(1);

    if (existingMember) {
      // W2.10 (security audit 2026-05-03): 之前此处返回 200 + status='already_registered',
      // 与"非成员加入"分支的 201 + 'registered' 不同 → 给攻击者(已掌握正确密码者)
      // 告知"这个用户是不是该机构成员", 是 org-membership 信息泄露. 现统一返回
      // 201 + 'registered'. 前端如需区分可读 isNewUser, 但 isNewUser 仅区分
      // "本次是否新建 user 行", 不暴露 org membership.
      const tokens = signTokens(userRow);
      return reply.code(201).send({
        status: 'registered',
        orgId: org.id,
        userId: userRow.id,
        isNewUser,
        ...tokens,
      });
    }

    // 补建 org_members(role='client') + clientProfile
    await db.insert(orgMembers).values({
      orgId: org.id,
      userId: userRow.id,
      role: 'client',
      status: 'active',
    });

    await db.insert(clientProfiles).values({
      orgId: org.id,
      userId: userRow.id,
      phone: body.phone || null,
    });

    const tokens = signTokens(userRow);
    return reply.code(201).send({
      status: 'registered',
      orgId: org.id,
      userId: userRow.id,
      isNewUser,
      ...tokens,
    });
  });
}

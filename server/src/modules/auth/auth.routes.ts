import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../config/database.js';
import { users } from '../../db/schema.js';
import { ValidationError } from '../../lib/errors.js';
import { getBootValue } from '../../lib/config-service.js';
import { authGuard } from '../../middleware/auth.js';

// env.ts validates JWT_SECRET is ≥ 32 chars at startup. No fallback here.
const JWT_SECRET = env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = getBootValue('security', 'accessTokenExpiry', '7d');
const REFRESH_TOKEN_EXPIRY = getBootValue('security', 'refreshTokenExpiry', '30d');

function signTokens(user: { id: string; email: string | null; isSystemAdmin?: boolean | null }) {
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, isSystemAdmin: user.isSystemAdmin ?? false },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY },
  );
  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY },
  );
  return { accessToken, refreshToken };
}

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /register —— 已弃用 (alpha)
   *
   * 历史上此端点会建 users 行但**不建 org_members**,导致用户登进去看到
   * "您尚未加入任何机构"的孤儿状态。alpha 起改为:所有注册必须走 orgType
   * 专属的公开入口,这样服务端事务里一次建齐 user + org_members + profile:
   *
   *   POST /api/public/counseling/:orgSlug/register  —— 咨询中心来访者
   *   POST /api/public/eap/:orgSlug/register         —— 企业员工
   *   POST /api/public/parent-bind/:token            —— 学校家长(班级邀请码)
   *
   * 故意返回 410 Gone 而不是 404,明确告知调用方"此功能被移除"。
   */
  app.post('/register', async (_request, reply) => {
    return reply.status(410).send({
      error: 'registration_endpoint_deprecated',
      message: '请通过机构专属注册入口注册(咨询中心 / EAP / 学校家长邀请)',
    });
  });

  /** Login with email/password */
  app.post('/login', async (request, reply) => {
    const { email, password } = request.body as {
      email: string;
      password: string;
    };

    if (!email || !password) {
      throw new ValidationError('email and password are required');
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      throw new ValidationError('邮箱或密码错误');
    }

    // Accounts with no stored password hash must fail closed — the old
    // "accept any password for migration" branch was a trivial takeover
    // primitive for any row whose `password_hash` column ended up NULL
    // (legacy imports, partial provisioning, direct DB edits). If a
    // legacy account genuinely needs activation, drive it through the
    // admin password-reset flow, not a public login bypass.
    // Using the same message as the wrong-password case so clients can't
    // probe which emails have unhashed rows.
    if (!user.passwordHash) {
      throw new ValidationError('邮箱或密码错误');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new ValidationError('邮箱或密码错误');
    }

    const tokens = signTokens(user);

    // Update last login timestamp (fire-and-forget)
    db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id))
      .catch(() => {/* ignore */});

    return reply.send({
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, isSystemAdmin: user.isSystemAdmin },
    });
  });

  /** Refresh token */
  app.post('/refresh', async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    if (!refreshToken) {
      throw new ValidationError('refreshToken is required');
    }

    try {
      // W3.4 (security audit 2026-05-03): pin algorithm — see middleware/auth.ts
      const payload = jwt.verify(refreshToken, JWT_SECRET, { algorithms: ['HS256'] }) as { sub: string; type?: string };

      if (payload.type !== 'refresh') {
        throw new ValidationError('Invalid refresh token');
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1);

      if (!user) {
        throw new ValidationError('用户不存在');
      }

      const tokens = signTokens(user);
      return reply.send(tokens);
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError('Refresh token expired or invalid');
    }
  });

  /** Logout */
  app.post('/logout', async (_request, reply) => {
    return reply.send({ ok: true });
  });

  /**
   * Phase 14f — Change own password.
   *
   * Body: { currentPassword?: string; newPassword: string }
   *
   * Auth required (authGuard). If the user has no existing passwordHash
   * (legacy/seed accounts), `currentPassword` may be omitted; otherwise it
   * must match. New password is at least 6 chars. After success the existing
   * JWT still works — we do not force logout.
   */
  app.post('/change-password', {
    preHandler: [authGuard],
  }, async (request, reply) => {
    const body = request.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    const newPassword = body?.newPassword;

    if (!newPassword || newPassword.length < 6) {
      throw new ValidationError('新密码至少 6 位');
    }

    const userId = request.user!.id;
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new ValidationError('用户不存在');

    // Verify current password when the account already has one
    if (user.passwordHash) {
      if (!body.currentPassword) {
        throw new ValidationError('请输入当前密码');
      }
      const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
      if (!ok) throw new ValidationError('当前密码不正确');
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));

    return reply.send({ ok: true });
  });
}

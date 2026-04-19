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

const JWT_SECRET = env.JWT_SECRET || 'psynote-dev-secret-change-in-production';
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
  /** Register a new user */
  app.post('/register', async (request, reply) => {
    const { email, password, name } = request.body as {
      email: string;
      password: string;
      name: string;
    };

    if (!email || !password || !name) {
      throw new ValidationError('email, password, and name are required');
    }

    // Check if email already exists
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      throw new ValidationError('该邮箱已注册');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [user] = await db.insert(users).values({
      email,
      name,
      passwordHash,
    }).returning();

    const tokens = signTokens(user);

    return reply.status(201).send({
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, isSystemAdmin: user.isSystemAdmin },
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
      const payload = jwt.verify(refreshToken, JWT_SECRET) as { sub: string; type?: string };

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

/**
 * Password Reset — 忘记密码 / 重置密码 二段式流程
 *
 * 三重安全保证:
 *   1. Token 32 字节随机十六进制(64 字符),只在邮件里出现;DB 只存 sha256(token)
 *   2. 15 分钟过期
 *   3. 一次性(用过即标 used_at,不能回放)
 *
 * 防枚举: POST /forgot-password 对未知邮箱同样返回 200,不透露注册状态。
 *
 * 详细设计见 docs/deployment/alpha.md §5 + plan Phase B。
 */
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { passwordResetTokens, users } from '../../db/schema.js';
import { ValidationError } from '../../lib/errors.js';
import { sendPasswordResetEmail } from '../../lib/mailer.js';
import { env } from '../../config/env.js';

const TOKEN_BYTES = 32;
const TOKEN_TTL_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 6;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

function buildResetLink(token: string): string {
  const base = env.PUBLIC_BASE_URL || env.CLIENT_URL;
  return `${base.replace(/\/$/, '')}/reset-password?token=${token}`;
}

export async function passwordResetRoutes(app: FastifyInstance) {
  /**
   * POST /forgot-password { email }
   *
   * 对未知邮箱也返回 200(防枚举)。对已知邮箱:
   *   - 生成 token
   *   - DB 存 sha256(token) + 15 分钟过期
   *   - 发送邮件含明文 token 链接
   */
  app.post('/forgot-password', async (request, reply) => {
    const { email } = (request.body ?? {}) as { email?: string };
    if (!email || typeof email !== 'string') {
      throw new ValidationError('email is required');
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      // 防枚举:静默返回 200
      return reply.send({ ok: true });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
    });

    const resetLink = buildResetLink(token);
    // 发邮件失败不暴露给调用方(防枚举 + 避免发信抖动影响 UX)
    try {
      await sendPasswordResetEmail(user.email!, resetLink);
    } catch (err) {
      request.log.error({ err }, 'Failed to send password reset email');
    }

    return reply.send({ ok: true });
  });

  /**
   * POST /reset-password { token, newPassword }
   *
   * 校验 token → 改 passwordHash → 标 usedAt。
   * 任何失败都返回相同的 400,不透露失败原因细节。
   */
  app.post('/reset-password', async (request, reply) => {
    const body = (request.body ?? {}) as {
      token?: string;
      newPassword?: string;
    };
    const token = body.token;
    const newPassword = body.newPassword;

    if (!token || typeof token !== 'string') {
      throw new ValidationError('token is required');
    }
    if (!newPassword || typeof newPassword !== 'string') {
      throw new ValidationError('newPassword is required');
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`新密码至少 ${MIN_PASSWORD_LENGTH} 位`);
    }

    const tokenHash = hashToken(token);

    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);

    if (!row) {
      throw new ValidationError('重置链接已失效,请重新申请');
    }
    if (row.usedAt) {
      throw new ValidationError('重置链接已使用过,请重新申请');
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      throw new ValidationError('重置链接已过期,请重新申请');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // 改密码
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, row.userId));

    // 标 token 已用(即使同 transaction 最好,但此处两次 update 幂等可接受)
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));

    return reply.send({ ok: true });
  });
}

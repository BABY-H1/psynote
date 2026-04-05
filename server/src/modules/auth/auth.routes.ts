import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../config/database.js';
import { users } from '../../db/schema.js';
import { ValidationError } from '../../lib/errors.js';

const JWT_SECRET = env.JWT_SECRET || 'psynote-dev-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_EXPIRY = '30d';

function signTokens(user: { id: string; email: string | null }) {
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email },
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
      user: { id: user.id, email: user.email, name: user.name },
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

    // Verify password (if user has no password_hash, accept any password for migration)
    if (user.passwordHash) {
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        throw new ValidationError('邮箱或密码错误');
      }
    }

    const tokens = signTokens(user);

    return reply.send({
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name },
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
}

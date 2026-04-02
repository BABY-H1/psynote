import type { FastifyInstance } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../config/database.js';
import { users } from '../../db/schema.js';
import { ValidationError } from '../../lib/errors.js';

const supabase = env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
  : null;

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

    if (!supabase) throw new ValidationError('Auth service not configured (Supabase not set up)');

    // Create in Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (error) {
      throw new ValidationError(error.message);
    }

    // Sync to our users table
    await db.insert(users).values({
      id: data.user.id,
      email: data.user.email!,
      name,
    }).onConflictDoNothing();

    return reply.status(201).send({
      user: { id: data.user.id, email: data.user.email, name },
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

    if (!supabase) throw new ValidationError('Auth service not configured (Supabase not set up)');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new ValidationError(error.message);
    }

    // Ensure user record exists in our table
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, data.user.id))
      .limit(1);

    if (!existing) {
      await db.insert(users).values({
        id: data.user.id,
        email: data.user.email!,
        name: data.user.user_metadata?.name || email.split('@')[0],
      });
    }

    return reply.send({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: existing?.name || data.user.user_metadata?.name,
      },
    });
  });

  /** Refresh token */
  app.post('/refresh', async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    if (!refreshToken) {
      throw new ValidationError('refreshToken is required');
    }

    if (!supabase) throw new ValidationError('Auth service not configured (Supabase not set up)');

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      throw new ValidationError(error.message);
    }

    return reply.send({
      accessToken: data.session!.access_token,
      refreshToken: data.session!.refresh_token,
    });
  });

  /** Logout */
  app.post('/logout', async (request, reply) => {
    // Client should discard tokens; server-side we can revoke via admin API if needed
    return reply.send({ ok: true });
  });
}

import type { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../lib/errors.js';

export interface AuthUser {
  id: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

const secret = env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
  : null;

/**
 * Authenticate requests by verifying the Supabase JWT.
 * In dev mode without SUPABASE_JWT_SECRET, accepts a simple `X-Dev-User-Id` header.
 */
export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  // Dev mode bypass: if no JWT secret configured, use dev headers
  if (!secret && env.NODE_ENV === 'development') {
    const devUserId = request.headers['x-dev-user-id'] as string;
    const devEmail = request.headers['x-dev-user-email'] as string;
    if (devUserId) {
      request.user = { id: devUserId, email: devEmail || 'dev@psynote.local' };
      return;
    }
  }

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);

  // Dev mode: accept demo tokens without verification
  if (!secret && env.NODE_ENV === 'development') {
    // Parse JWT payload without verification for dev
    try {
      const payloadBase64 = token.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
      request.user = {
        id: payload.sub || 'demo-user',
        email: payload.email || 'dev@psynote.local',
      };
      return;
    } catch {
      // If token can't be parsed, use a fallback dev user
      request.user = { id: 'demo-counselor-001', email: 'dev@psynote.local' };
      return;
    }
  }

  try {
    const { payload } = await jwtVerify(token, secret!, {
      audience: 'authenticated',
    });

    if (!payload.sub || !payload.email) {
      throw new UnauthorizedError('Invalid token payload');
    }

    request.user = {
      id: payload.sub,
      email: payload.email as string,
    };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired token');
  }
}

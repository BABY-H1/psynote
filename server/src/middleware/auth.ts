import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../lib/errors.js';

// env.ts validates JWT_SECRET is ≥ 32 chars at startup. No fallback here.
const JWT_SECRET = env.JWT_SECRET;

export interface AuthUser {
  id: string;
  email: string;
  isSystemAdmin: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/**
 * Authenticate requests by verifying the JWT token.
 */
export async function authGuard(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      email?: string;
      isSystemAdmin?: boolean;
    };

    if (!payload.sub) {
      throw new UnauthorizedError('Invalid token payload');
    }

    request.user = {
      id: payload.sub,
      email: (payload.email as string) || '',
      isSystemAdmin: payload.isSystemAdmin ?? false,
    };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired token');
  }
}

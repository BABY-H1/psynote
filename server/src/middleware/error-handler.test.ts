import { describe, it, expect, beforeAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandler } from './error-handler.js';
import { AppError, ValidationError, NotFoundError } from '../lib/errors.js';

/**
 * errorHandler is pure — no DB, no network. Test it with a tiny Fastify
 * app whose routes throw the shapes we expect to see in production.
 *
 * Coverage priorities, in order of damage-if-regressed:
 *   1. AppError subclasses preserve their statusCode + code — relied on
 *      by every business endpoint.
 *   2. Fastify's built-in validation errors → 400 (zod / fastify-validate).
 *   3. FastifyError with its own statusCode (413 body-too-large, 415
 *      unsupported media, etc.) — previously fell through to 500.
 *   4. Unknown non-Error throws → 500 with safe default message.
 */

function buildApp(): FastifyInstance {
  const app = Fastify({ bodyLimit: 1024 }); // 1 KB limit so tests can easily trip 413
  app.setErrorHandler(errorHandler);

  app.get('/app-error', async () => {
    throw new ValidationError('missing field x');
  });

  app.get('/not-found', async () => {
    throw new NotFoundError('Widget', 'abc');
  });

  app.get('/app-error-custom', async () => {
    throw new AppError(418, "I'm a teapot", 'TEAPOT');
  });

  app.get('/boom', async () => {
    throw new Error('kaboom');
  });

  // Body-too-large path — Fastify itself throws FST_ERR_CTP_BODY_TOO_LARGE
  // (statusCode 413) before the handler runs. Route has to accept a body.
  app.post('/echo', async (req) => req.body);

  return app;
}

describe('errorHandler', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    app = buildApp();
  });

  it('AppError subclass → status+code+message pass through', async () => {
    const res = await app.inject({ method: 'GET', url: '/app-error' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('missing field x');
  });

  it('NotFoundError → 404 NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: '/not-found' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NOT_FOUND');
  });

  it('custom AppError with a non-stock statusCode is honored', async () => {
    const res = await app.inject({ method: 'GET', url: '/app-error-custom' });
    expect(res.statusCode).toBe(418);
    expect(res.json().error).toBe('TEAPOT');
  });

  it('unknown Error → 500 with safe default message', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('INTERNAL_ERROR');
  });

  it('payload too large → 413 (FastifyError.statusCode preserved, not swallowed as 500)', async () => {
    // bodyLimit is 1 KB; send 2 KB to trip FST_ERR_CTP_BODY_TOO_LARGE.
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      payload: 'x'.repeat(2048),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(413);
  });
});

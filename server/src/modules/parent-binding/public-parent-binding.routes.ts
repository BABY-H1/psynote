/**
 * Public parent-binding landing routes.
 *
 * Mounted at /api/public/parent-bind   (no auth required, but should be rate-limited)
 *
 * GET    /:token   — Preview (school + class name, no student list)
 * POST   /:token   — Submit student-identifying fields + parent name + password.
 *                    On success, creates the guardian user, binds them to the
 *                    student, and returns JWT tokens (login-shape payload).
 */
import type { FastifyInstance } from 'fastify';
import * as parentBindingService from './parent-binding.service.js';

export async function publicParentBindingRoutes(app: FastifyInstance) {
  // No auth — public endpoints. Rate-limited globally via @fastify/rate-limit.

  app.get('/:token', async (request) => {
    const { token } = request.params as { token: string };
    return parentBindingService.getTokenPreview(token);
  });

  app.post('/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = (request.body || {}) as Record<string, any>;

    const result = await parentBindingService.bind({
      token,
      studentName: String(body.studentName || ''),
      studentNumber: String(body.studentNumber || ''),
      phoneLast4: String(body.phoneLast4 || ''),
      relation: body.relation,
      myName: String(body.myName || ''),
      password: String(body.password || ''),
    });

    return reply.status(201).send(result);
  });
}

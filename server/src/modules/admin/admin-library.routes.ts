/**
 * Admin system-level knowledge base routes.
 *
 * CRUD for system content (orgId IS NULL) across 5 content types:
 * scales, courses, groupSchemes, noteTemplates, treatmentGoalLibrary.
 */
import type { FastifyInstance } from 'fastify';
import { eq, isNull, and, ilike, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  scales,
  courses,
  groupSchemes,
  noteTemplates,
  treatmentGoalLibrary,
} from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { requireSystemAdmin } from '../../middleware/system-admin.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';

export async function adminLibraryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', requireSystemAdmin);

  // ─── Scales ─────────────────────────────────────────────────────

  app.get('/scales', async (request) => {
    const { search } = request.query as { search?: string };
    let query = db
      .select()
      .from(scales)
      .where(isNull(scales.orgId))
      .orderBy(desc(scales.createdAt))
      .$dynamic();

    if (search) {
      query = query.where(and(isNull(scales.orgId), ilike(scales.title, `%${search}%`)));
    }

    return query;
  });

  app.post('/scales', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const [item] = await db.insert(scales).values({
      ...body,
      orgId: null,
      isPublic: true,
      createdBy: request.user!.id,
    } as any).returning();
    await logAudit(request, 'create', 'scales', item.id);
    return reply.status(201).send(item);
  });

  app.patch('/scales/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const [updated] = await db.update(scales).set(body as any).where(eq(scales.id, id)).returning();
    await logAudit(request, 'update', 'scales', id);
    return updated;
  });

  app.delete('/scales/:id', async (request) => {
    const { id } = request.params as { id: string };
    await db.delete(scales).where(eq(scales.id, id));
    await logAudit(request, 'delete', 'scales', id);
    return { ok: true };
  });

  // ─── Courses ────────────────────────────────────────────────────

  app.get('/courses', async (request) => {
    const { search } = request.query as { search?: string };
    let query = db
      .select()
      .from(courses)
      .where(and(isNull(courses.orgId), eq(courses.isTemplate, true)))
      .orderBy(desc(courses.createdAt))
      .$dynamic();

    if (search) {
      query = query.where(
        and(isNull(courses.orgId), eq(courses.isTemplate, true), ilike(courses.title, `%${search}%`)),
      );
    }

    return query;
  });

  app.post('/courses', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const [item] = await db.insert(courses).values({
      ...body,
      orgId: null,
      isTemplate: true,
      createdBy: request.user!.id,
    } as any).returning();
    await logAudit(request, 'create', 'courses', item.id);
    return reply.status(201).send(item);
  });

  app.patch('/courses/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const [updated] = await db.update(courses).set(body as any).where(eq(courses.id, id)).returning();
    await logAudit(request, 'update', 'courses', id);
    return updated;
  });

  app.delete('/courses/:id', async (request) => {
    const { id } = request.params as { id: string };
    await db.update(courses).set({ deletedAt: new Date() } as any).where(eq(courses.id, id));
    await logAudit(request, 'delete', 'courses', id);
    return { ok: true };
  });

  // ─── Group Schemes ──────────────────────────────────────────────

  app.get('/schemes', async (request) => {
    const { search } = request.query as { search?: string };
    let query = db
      .select()
      .from(groupSchemes)
      .where(isNull(groupSchemes.orgId))
      .orderBy(desc(groupSchemes.createdAt))
      .$dynamic();

    if (search) {
      query = query.where(and(isNull(groupSchemes.orgId), ilike(groupSchemes.title, `%${search}%`)));
    }

    return query;
  });

  app.post('/schemes', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const [item] = await db.insert(groupSchemes).values({
      ...body,
      orgId: null,
      visibility: 'public',
      createdBy: request.user!.id,
    } as any).returning();
    await logAudit(request, 'create', 'group_schemes', item.id);
    return reply.status(201).send(item);
  });

  app.patch('/schemes/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const [updated] = await db.update(groupSchemes).set(body as any).where(eq(groupSchemes.id, id)).returning();
    await logAudit(request, 'update', 'group_schemes', id);
    return updated;
  });

  app.delete('/schemes/:id', async (request) => {
    const { id } = request.params as { id: string };
    await db.delete(groupSchemes).where(eq(groupSchemes.id, id));
    await logAudit(request, 'delete', 'group_schemes', id);
    return { ok: true };
  });

  // ─── Note Templates ─────────────────────────────────────────────

  app.get('/templates', async (request) => {
    const { search } = request.query as { search?: string };
    let query = db
      .select()
      .from(noteTemplates)
      .where(isNull(noteTemplates.orgId))
      .orderBy(desc(noteTemplates.createdAt))
      .$dynamic();

    if (search) {
      query = query.where(and(isNull(noteTemplates.orgId), ilike(noteTemplates.title, `%${search}%`)));
    }

    return query;
  });

  app.post('/templates', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const [item] = await db.insert(noteTemplates).values({
      ...body,
      orgId: null,
      visibility: 'public',
      createdBy: request.user!.id,
    } as any).returning();
    await logAudit(request, 'create', 'note_templates', item.id);
    return reply.status(201).send(item);
  });

  app.patch('/templates/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const [updated] = await db.update(noteTemplates).set(body as any).where(eq(noteTemplates.id, id)).returning();
    await logAudit(request, 'update', 'note_templates', id);
    return updated;
  });

  app.delete('/templates/:id', async (request) => {
    const { id } = request.params as { id: string };
    await db.delete(noteTemplates).where(eq(noteTemplates.id, id));
    await logAudit(request, 'delete', 'note_templates', id);
    return { ok: true };
  });

  // ─── Treatment Goal Library ─────────────────────────────────────

  app.get('/goals', async (request) => {
    const { search } = request.query as { search?: string };
    let query = db
      .select()
      .from(treatmentGoalLibrary)
      .where(isNull(treatmentGoalLibrary.orgId))
      .orderBy(desc(treatmentGoalLibrary.createdAt))
      .$dynamic();

    if (search) {
      query = query.where(and(isNull(treatmentGoalLibrary.orgId), ilike(treatmentGoalLibrary.title, `%${search}%`)));
    }

    return query;
  });

  app.post('/goals', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const [item] = await db.insert(treatmentGoalLibrary).values({
      ...body,
      orgId: null,
      visibility: 'public',
    } as any).returning();
    await logAudit(request, 'create', 'treatment_goal_library', item.id);
    return reply.status(201).send(item);
  });

  app.patch('/goals/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const [updated] = await db.update(treatmentGoalLibrary).set(body as any).where(eq(treatmentGoalLibrary.id, id)).returning();
    await logAudit(request, 'update', 'treatment_goal_library', id);
    return updated;
  });

  app.delete('/goals/:id', async (request) => {
    const { id } = request.params as { id: string };
    await db.delete(treatmentGoalLibrary).where(eq(treatmentGoalLibrary.id, id));
    await logAudit(request, 'delete', 'treatment_goal_library', id);
    return { ok: true };
  });

  // ─── Distribution Management ────────────────────────────────────
  // Update allowedOrgIds for any content type

  const distributionTables: Record<string, any> = {
    scales, courses, groupSchemes: groupSchemes, templates: noteTemplates, goals: treatmentGoalLibrary,
  };

  for (const [type, table] of Object.entries(distributionTables)) {
    app.patch(`/${type}/:id/distribution`, async (request) => {
      const { id } = request.params as { id: string };
      const { allowedOrgIds } = request.body as { allowedOrgIds: string[] };

      if (!Array.isArray(allowedOrgIds)) {
        throw new ValidationError('allowedOrgIds must be an array');
      }

      const [updated] = await db
        .update(table)
        .set({ allowedOrgIds } as any)
        .where(eq(table.id, id))
        .returning();

      if (!updated) throw new NotFoundError(type, id);

      await logAudit(request, 'distribution.updated', type, id);
      return { ok: true, allowedOrgIds };
    });
  }
}

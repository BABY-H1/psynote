/**
 * Admin system-level knowledge base routes.
 *
 * CRUD for system content (orgId IS NULL) across 6 content types:
 * scales, courses, groupSchemes, noteTemplates, treatmentGoalLibrary,
 * consentTemplates (agreements).
 *
 * Mirrors the org-side knowledge tabs 1:1 so the system admin can use the
 * same library UI as org users; see `AdminLibrary.tsx` + `libraryApi()`.
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
  consentTemplates,
} from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { requireSystemAdmin } from '../../middleware/system-admin.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';
import * as scaleService from '../assessment/scale.service.js';
import * as courseService from '../course/course.service.js';

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

  // Single-entity fetch — required by ScaleDetail/SchemeDetail/AgreementDetail
  // when the shared org-side library components load an item for editing.
  // Scoped to platform-level rows only (orgId IS NULL) so this endpoint
  // can't be used to exfiltrate an org's private content.
  app.get('/scales/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    // 先验存在性 + 平台级 (orgId IS NULL) 限制 — 防止被用来读 org 私有 scale
    const [shell] = await db
      .select({ id: scales.id, orgId: scales.orgId })
      .from(scales)
      .where(and(eq(scales.id, id), isNull(scales.orgId)))
      .limit(1);
    if (!shell) return reply.status(404).send({ message: 'Scale not found' });
    // 用 service 加载完整嵌套(dimensions / rules / items) — 之前只 select scales,
    // 编辑页拿到的永远是空骨架.
    return scaleService.getScaleById(id);
  });

  /**
   * 平台级 scale 创建.
   *
   * 历史 bug: 这里早先直接 `db.insert(scales).values({ ...body })`,
   * 完全无视 body 里的 dimensions/items/rules — 只把壳子写进 scales 表,
   * 子表 (scale_dimensions / scale_items / dimension_rules) 全部丢弃.
   * AI 量表生成器走的就是这条路, 用户点 "保存并进入编辑" 看上去 201
   * 成功, 实际进编辑页发现没题目 / 没维度 / 没分数解读规则.
   *
   * 改用 scaleService.createScale 做完整 4 表事务插入. 平台级 scale 用
   * orgId=null + isPublic=true 让所有 org 可见.
   */
  app.post('/scales', async (request, reply) => {
    const body = request.body as {
      title: string;
      description?: string;
      instructions?: string;
      scoringMode?: string;
      dimensions: {
        name: string;
        description?: string;
        calculationMethod?: string;
        sortOrder?: number;
        rules?: { minScore: number; maxScore: number; label: string; description?: string; advice?: string; riskLevel?: string }[];
      }[];
      items: {
        text: string;
        dimensionIndex: number;
        isReverseScored?: boolean;
        options: { label: string; value: number }[];
        sortOrder?: number;
      }[];
    };

    if (!body.title) throw new ValidationError('title is required');
    if (!body.dimensions || body.dimensions.length === 0) throw new ValidationError('At least one dimension is required');
    if (!body.items || body.items.length === 0) throw new ValidationError('At least one item is required');

    const scale = await scaleService.createScale({
      orgId: null,
      isPublic: true,
      createdBy: request.user!.id,
      title: body.title,
      description: body.description,
      instructions: body.instructions,
      scoringMode: body.scoringMode,
      dimensions: body.dimensions,
      items: body.items,
    });
    await logAudit(request, 'create', 'scales', scale.id);
    return reply.status(201).send(scale);
  });

  /**
   * 平台级 scale 更新. 同样的历史 bug — 原代码 db.update(scales).set(body),
   * 不会动子表. 用 scaleService.updateScale 做事务级替换.
   */
  app.patch('/scales/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Parameters<typeof scaleService.updateScale>[1];
    const updated = await scaleService.updateScale(id, body);
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

  app.get('/courses/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    // 先做平台级存在性 (orgId IS NULL) 校验防跨 scope 泄漏
    const [shell] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.id, id), isNull(courses.orgId)))
      .limit(1);
    if (!shell) return reply.status(404).send({ message: 'Course not found' });
    // 用 service 加载完整嵌套 (含 chapters 子表) — 之前只 select courses 一张表,
    // chapters 永远不可见, 编辑页空骨架.
    return courseService.getCourseById(id);
  });

  /**
   * 平台级 course 创建.
   *
   * 历史 bug: 原代码 db.insert(courses).values({ ...body }) 浅 copy, 完全不
   * 写 course_chapters 子表 — AI 生成的章节 / 视频 / 内容全部丢. 跟 admin
   * scale save fix (commit ef181e0) 同款问题, 同款修法.
   *
   * 改用 courseService.createCourse 做 chapters 嵌套写入. 平台级 course 用
   * orgId=null + isTemplate=true 让所有 org 可见.
   */
  app.post('/courses', async (request, reply) => {
    const body = request.body as {
      title: string;
      description?: string;
      category?: string;
      coverUrl?: string;
      duration?: string;
      status?: string;
      courseType?: string;
      targetAudience?: string;
      scenario?: string;
      responsibleId?: string;
      sourceTemplateId?: string;
      creationMode?: string;
      requirementsConfig?: Record<string, any>;
      blueprintData?: Record<string, any>;
      tags?: string[];
      chapters?: Array<{
        title: string;
        content?: string;
        videoUrl?: string;
        duration?: string;
        sortOrder?: number;
        relatedAssessmentId?: string;
        sessionGoal?: string;
        coreConcepts?: string;
        interactionSuggestions?: string;
        homeworkSuggestion?: string;
      }>;
    };

    if (!body.title) throw new ValidationError('title is required');

    const course = await courseService.createCourse({
      orgId: null,
      isTemplate: true,
      isPublic: true,
      createdBy: request.user!.id,
      title: body.title,
      description: body.description,
      category: body.category,
      coverUrl: body.coverUrl,
      duration: body.duration,
      status: body.status,
      courseType: body.courseType,
      targetAudience: body.targetAudience,
      scenario: body.scenario,
      responsibleId: body.responsibleId,
      sourceTemplateId: body.sourceTemplateId,
      creationMode: body.creationMode,
      requirementsConfig: body.requirementsConfig,
      blueprintData: body.blueprintData,
      tags: body.tags,
      chapters: body.chapters,
    });
    await logAudit(request, 'create', 'courses', course.id);
    return reply.status(201).send(course);
  });

  /**
   * 平台级 course PATCH 只更新顶层字段 (title / description / category 等).
   * 章节增删改走专门的 /courses/:id/chapters/* 端点 (course-chapter
   * routes), 不在这条 PATCH 上.
   */
  app.patch('/courses/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Parameters<typeof courseService.updateCourse>[1];
    const updated = await courseService.updateCourse(id, body);
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

  app.get('/schemes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db
      .select()
      .from(groupSchemes)
      .where(and(eq(groupSchemes.id, id), isNull(groupSchemes.orgId)))
      .limit(1);
    if (!row) return reply.status(404).send({ message: 'Scheme not found' });
    return row;
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

  app.get('/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db
      .select()
      .from(noteTemplates)
      .where(and(eq(noteTemplates.id, id), isNull(noteTemplates.orgId)))
      .limit(1);
    if (!row) return reply.status(404).send({ message: 'Note template not found' });
    return row;
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

  app.get('/goals/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db
      .select()
      .from(treatmentGoalLibrary)
      .where(and(eq(treatmentGoalLibrary.id, id), isNull(treatmentGoalLibrary.orgId)))
      .limit(1);
    if (!row) return reply.status(404).send({ message: 'Goal not found' });
    return row;
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

  // ─── Agreements (Consent Templates) ─────────────────────────────

  app.get('/agreements', async (request) => {
    const { search } = request.query as { search?: string };
    let query = db
      .select()
      .from(consentTemplates)
      .where(isNull(consentTemplates.orgId))
      .orderBy(desc(consentTemplates.createdAt))
      .$dynamic();

    if (search) {
      query = query.where(and(isNull(consentTemplates.orgId), ilike(consentTemplates.title, `%${search}%`)));
    }

    return query;
  });

  app.get('/agreements/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db
      .select()
      .from(consentTemplates)
      .where(and(eq(consentTemplates.id, id), isNull(consentTemplates.orgId)))
      .limit(1);
    if (!row) return reply.status(404).send({ message: 'Agreement not found' });
    return row;
  });

  app.post('/agreements', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const [item] = await db.insert(consentTemplates).values({
      ...body,
      orgId: null,
      createdBy: request.user!.id,
    } as any).returning();
    await logAudit(request, 'create', 'consent_templates', item.id);
    return reply.status(201).send(item);
  });

  app.patch('/agreements/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const [updated] = await db
      .update(consentTemplates)
      .set({ ...body, updatedAt: new Date() } as any)
      .where(eq(consentTemplates.id, id))
      .returning();
    await logAudit(request, 'update', 'consent_templates', id);
    return updated;
  });

  app.delete('/agreements/:id', async (request) => {
    const { id } = request.params as { id: string };
    await db.delete(consentTemplates).where(eq(consentTemplates.id, id));
    await logAudit(request, 'delete', 'consent_templates', id);
    return { ok: true };
  });

  // ─── Distribution Management ────────────────────────────────────
  // Update allowedOrgIds for any content type

  const distributionTables: Record<string, any> = {
    scales,
    courses,
    schemes: groupSchemes,
    templates: noteTemplates,
    goals: treatmentGoalLibrary,
    agreements: consentTemplates,
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

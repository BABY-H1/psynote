import { eq, and, or, isNull, asc, desc, like, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  courses, courseChapters, courseEnrollments, careTimeline,
  courseLessonBlocks, courseTemplateTags,
} from '../../db/schema.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';

export interface CourseFilters {
  status?: string;
  courseType?: string;
  isTemplate?: boolean;
  search?: string;
}

export async function listCourses(orgId: string, filters?: CourseFilters) {
  let query = db
    .select()
    .from(courses)
    .where(
      or(
        eq(courses.orgId, orgId),
        and(isNull(courses.orgId), eq(courses.isPublic, true)),
      ),
    )
    .orderBy(desc(courses.updatedAt))
    .$dynamic();

  // Note: Drizzle doesn't support dynamic where chaining easily,
  // so we fetch all and filter in JS for now. For production, use raw SQL or Drizzle's query builder.
  const all = await query;

  return all.filter((c) => {
    if (filters?.status && c.status !== filters.status) return false;
    if (filters?.courseType && c.courseType !== filters.courseType) return false;
    if (filters?.isTemplate !== undefined && c.isTemplate !== filters.isTemplate) return false;
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      if (!c.title.toLowerCase().includes(s) && !(c.description || '').toLowerCase().includes(s)) return false;
    }
    return true;
  });
}

export async function getCourseById(courseId: string) {
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!course) throw new NotFoundError('Course', courseId);

  const chapters = await db
    .select()
    .from(courseChapters)
    .where(eq(courseChapters.courseId, courseId))
    .orderBy(asc(courseChapters.sortOrder));

  return { ...course, chapters };
}

export async function createCourse(input: {
  orgId: string;
  title: string;
  description?: string;
  category?: string;
  coverUrl?: string;
  duration?: string;
  isPublic?: boolean;
  createdBy: string;
  // New lifecycle fields
  status?: string;
  courseType?: string;
  targetAudience?: string;
  scenario?: string;
  responsibleId?: string;
  isTemplate?: boolean;
  sourceTemplateId?: string;
  requirementsConfig?: Record<string, any>;
  blueprintData?: Record<string, any>;
  tags?: string[];
  chapters?: {
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
  }[];
}) {
  const [course] = await db.insert(courses).values({
    orgId: input.orgId,
    title: input.title,
    description: input.description,
    category: input.category,
    coverUrl: input.coverUrl,
    duration: input.duration,
    isPublic: input.isPublic || false,
    status: input.status || 'draft',
    courseType: input.courseType,
    targetAudience: input.targetAudience,
    scenario: input.scenario,
    responsibleId: input.responsibleId,
    isTemplate: input.isTemplate || false,
    sourceTemplateId: input.sourceTemplateId,
    requirementsConfig: input.requirementsConfig || {},
    blueprintData: input.blueprintData || {},
    tags: input.tags || [],
    createdBy: input.createdBy,
  }).returning();

  if (input.chapters && input.chapters.length > 0) {
    await db.insert(courseChapters).values(
      input.chapters.map((ch, idx) => ({
        courseId: course.id,
        title: ch.title,
        content: ch.content,
        videoUrl: ch.videoUrl,
        duration: ch.duration,
        sortOrder: ch.sortOrder ?? idx,
        relatedAssessmentId: ch.relatedAssessmentId || null,
        sessionGoal: ch.sessionGoal,
        coreConcepts: ch.coreConcepts,
        interactionSuggestions: ch.interactionSuggestions,
        homeworkSuggestion: ch.homeworkSuggestion,
      })),
    );
  }

  return getCourseById(course.id);
}

export async function updateCourse(
  courseId: string,
  updates: Partial<{
    title: string;
    description: string;
    category: string;
    coverUrl: string;
    duration: string;
    isPublic: boolean;
    status: string;
    courseType: string;
    targetAudience: string;
    scenario: string;
    responsibleId: string;
    isTemplate: boolean;
    requirementsConfig: Record<string, any>;
    blueprintData: Record<string, any>;
    tags: string[];
  }>,
) {
  const [updated] = await db
    .update(courses)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(courses.id, courseId))
    .returning();

  if (!updated) throw new NotFoundError('Course', courseId);
  return updated;
}

export async function deleteCourse(courseId: string) {
  const [deleted] = await db
    .delete(courses)
    .where(eq(courses.id, courseId))
    .returning();

  if (!deleted) throw new NotFoundError('Course', courseId);
  return deleted;
}

// ─── Enrollment ──────────────────────────────────────────────────

export async function enrollInCourse(input: {
  courseId: string;
  userId: string;
  careEpisodeId?: string;
}) {
  const [existing] = await db
    .select()
    .from(courseEnrollments)
    .where(and(
      eq(courseEnrollments.courseId, input.courseId),
      eq(courseEnrollments.userId, input.userId),
    ))
    .limit(1);

  if (existing) throw new ConflictError('User is already enrolled in this course');

  const [enrollment] = await db.insert(courseEnrollments).values({
    courseId: input.courseId,
    userId: input.userId,
    careEpisodeId: input.careEpisodeId || null,
  }).returning();

  if (input.careEpisodeId) {
    await db.insert(careTimeline).values({
      careEpisodeId: input.careEpisodeId,
      eventType: 'course_enrollment',
      refId: enrollment.id,
      title: '报名课程',
      summary: '已报名课程学习',
      createdBy: input.userId,
    });
  }

  return enrollment;
}

export async function updateCourseProgress(
  enrollmentId: string,
  chapterId: string,
  completed: boolean,
) {
  const [enrollment] = await db
    .select()
    .from(courseEnrollments)
    .where(eq(courseEnrollments.id, enrollmentId))
    .limit(1);

  if (!enrollment) throw new NotFoundError('CourseEnrollment', enrollmentId);

  const progress = (enrollment.progress || {}) as Record<string, boolean>;
  progress[chapterId] = completed;

  const [updated] = await db
    .update(courseEnrollments)
    .set({ progress })
    .where(eq(courseEnrollments.id, enrollmentId))
    .returning();

  return updated;
}

export async function listMyEnrollments(userId: string) {
  return db
    .select({
      enrollment: courseEnrollments,
      courseTitle: courses.title,
      courseCategory: courses.category,
    })
    .from(courseEnrollments)
    .leftJoin(courses, eq(courses.id, courseEnrollments.courseId))
    .where(eq(courseEnrollments.userId, userId))
    .orderBy(desc(courseEnrollments.enrolledAt));
}

// ─── Lifecycle Operations ───────────────────────────────────────

export async function publishCourse(courseId: string) {
  return updateCourse(courseId, { status: 'published' });
}

export async function archiveCourse(courseId: string) {
  return updateCourse(courseId, { status: 'archived' });
}

export async function cloneCourse(courseId: string, userId: string, orgId: string) {
  const source = await getCourseById(courseId);

  const [newCourse] = await db.insert(courses).values({
    orgId,
    title: `${source.title}（副本）`,
    description: source.description,
    category: source.category,
    coverUrl: source.coverUrl,
    duration: source.duration,
    isPublic: false,
    status: 'draft',
    courseType: source.courseType,
    targetAudience: source.targetAudience,
    scenario: source.scenario,
    responsibleId: userId,
    isTemplate: false,
    sourceTemplateId: source.isTemplate ? courseId : source.sourceTemplateId,
    requirementsConfig: source.requirementsConfig || {},
    blueprintData: source.blueprintData || {},
    tags: source.tags || [],
    createdBy: userId,
  }).returning();

  // Clone chapters
  if (source.chapters && source.chapters.length > 0) {
    for (const ch of source.chapters) {
      const [newChapter] = await db.insert(courseChapters).values({
        courseId: newCourse.id,
        title: ch.title,
        content: ch.content,
        videoUrl: ch.videoUrl,
        duration: ch.duration,
        sortOrder: ch.sortOrder,
        relatedAssessmentId: ch.relatedAssessmentId,
        sessionGoal: ch.sessionGoal,
        coreConcepts: ch.coreConcepts,
        interactionSuggestions: ch.interactionSuggestions,
        homeworkSuggestion: ch.homeworkSuggestion,
      }).returning();

      // Clone lesson blocks for this chapter
      const blocks = await db
        .select()
        .from(courseLessonBlocks)
        .where(eq(courseLessonBlocks.chapterId, ch.id))
        .orderBy(asc(courseLessonBlocks.sortOrder));

      if (blocks.length > 0) {
        await db.insert(courseLessonBlocks).values(
          blocks.map((b) => ({
            chapterId: newChapter.id,
            blockType: b.blockType,
            content: b.content,
            sortOrder: b.sortOrder,
            aiGenerated: b.aiGenerated,
          })),
        );
      }
    }
  }

  return getCourseById(newCourse.id);
}

// ─── Lesson Blocks ──────────────────────────────────────────────

export async function listLessonBlocks(chapterId: string) {
  return db
    .select()
    .from(courseLessonBlocks)
    .where(eq(courseLessonBlocks.chapterId, chapterId))
    .orderBy(asc(courseLessonBlocks.sortOrder));
}

export async function upsertLessonBlocks(
  chapterId: string,
  blocks: { id?: string; blockType: string; content?: string; sortOrder: number; aiGenerated?: boolean; lastAiInstruction?: string }[],
) {
  // Delete existing blocks and re-insert (simple bulk upsert)
  await db.delete(courseLessonBlocks).where(eq(courseLessonBlocks.chapterId, chapterId));

  if (blocks.length === 0) return [];

  return db.insert(courseLessonBlocks).values(
    blocks.map((b) => ({
      chapterId,
      blockType: b.blockType,
      content: b.content || null,
      sortOrder: b.sortOrder,
      aiGenerated: b.aiGenerated || false,
      lastAiInstruction: b.lastAiInstruction || null,
    })),
  ).returning();
}

export async function updateLessonBlock(
  blockId: string,
  updates: Partial<{ content: string; aiGenerated: boolean; lastAiInstruction: string }>,
) {
  const [updated] = await db
    .update(courseLessonBlocks)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(courseLessonBlocks.id, blockId))
    .returning();

  if (!updated) throw new NotFoundError('LessonBlock', blockId);
  return updated;
}

// ─── Course Assignment ──────────────────────────────────────────

export async function assignCourseToClient(input: {
  courseId: string;
  clientUserId: string;
  counselorId: string;
  careEpisodeId?: string;
}) {
  const [existing] = await db
    .select()
    .from(courseEnrollments)
    .where(and(
      eq(courseEnrollments.courseId, input.courseId),
      eq(courseEnrollments.userId, input.clientUserId),
    ))
    .limit(1);

  if (existing) throw new ConflictError('Client is already enrolled in this course');

  const [enrollment] = await db.insert(courseEnrollments).values({
    courseId: input.courseId,
    userId: input.clientUserId,
    careEpisodeId: input.careEpisodeId || null,
    assignedBy: input.counselorId,
  }).returning();

  if (input.careEpisodeId) {
    await db.insert(careTimeline).values({
      careEpisodeId: input.careEpisodeId,
      eventType: 'course_enrollment',
      refId: enrollment.id,
      title: '指派课程',
      summary: '咨询师指派了课程学习',
      createdBy: input.counselorId,
    });
  }

  return enrollment;
}

// ─── Template Tags ──────────────────────────────────────────────

export async function listTemplateTags(orgId: string) {
  return db
    .select()
    .from(courseTemplateTags)
    .where(eq(courseTemplateTags.orgId, orgId))
    .orderBy(asc(courseTemplateTags.name));
}

export async function createTemplateTag(orgId: string, name: string, color?: string) {
  const [tag] = await db.insert(courseTemplateTags).values({
    orgId,
    name,
    color: color || null,
  }).returning();
  return tag;
}

export async function deleteTemplateTag(tagId: string) {
  const [deleted] = await db
    .delete(courseTemplateTags)
    .where(eq(courseTemplateTags.id, tagId))
    .returning();
  if (!deleted) throw new NotFoundError('TemplateTag', tagId);
  return deleted;
}

// ─── Blueprint → Chapters ───────────────────────────────────────

export async function saveBlueprintAsChapters(
  courseId: string,
  sessions: { title: string; goal: string; coreConcepts: string; interactionSuggestions: string; homeworkSuggestion: string }[],
) {
  // Delete existing chapters
  await db.delete(courseChapters).where(eq(courseChapters.courseId, courseId));

  if (sessions.length === 0) return [];

  const inserted = await db.insert(courseChapters).values(
    sessions.map((s, idx) => ({
      courseId,
      title: s.title,
      sortOrder: idx,
      sessionGoal: s.goal,
      coreConcepts: s.coreConcepts,
      interactionSuggestions: s.interactionSuggestions,
      homeworkSuggestion: s.homeworkSuggestion,
    })),
  ).returning();

  // Update course status to content_authoring
  await updateCourse(courseId, { status: 'content_authoring' });

  return inserted;
}

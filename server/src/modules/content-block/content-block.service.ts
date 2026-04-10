/**
 * Phase 9α — Content block service.
 * Unified CRUD across course_content_blocks and group_session_blocks.
 * Parent type is passed in explicitly; storage table is chosen accordingly.
 */
import { eq, and, asc, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  courseContentBlocks,
  groupSessionBlocks,
  courseChapters,
  courses,
  groupSchemeSessions,
  groupSchemes,
} from '../../db/schema.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../lib/errors.js';
import type { BlockVisibility, ContentBlockType } from '@psynote/shared';

export type ParentType = 'course' | 'group';

/** The 8 accepted content block types. Validates user input. */
const VALID_BLOCK_TYPES: ReadonlySet<ContentBlockType> = new Set<ContentBlockType>([
  'video', 'audio', 'rich_text', 'pdf', 'quiz', 'reflection', 'worksheet', 'check_in',
]);
const VALID_VISIBILITIES: ReadonlySet<BlockVisibility> = new Set<BlockVisibility>([
  'participant', 'facilitator', 'both',
]);

function assertBlockType(value: string): asserts value is ContentBlockType {
  if (!VALID_BLOCK_TYPES.has(value as ContentBlockType)) {
    throw new ValidationError(`Invalid block type: ${value}`);
  }
}
function assertVisibility(value: string): asserts value is BlockVisibility {
  if (!VALID_VISIBILITIES.has(value as BlockVisibility)) {
    throw new ValidationError(`Invalid visibility: ${value}`);
  }
}

// ─── Parent validation ──────────────────────────────────────────────

/**
 * Ensure the chapter belongs to a course owned by the current org.
 * Returns { orgId, courseId } on success.
 */
async function assertCourseChapterInOrg(chapterId: string, orgId: string) {
  const rows = await db
    .select({ chapterId: courseChapters.id, courseId: courses.id, orgId: courses.orgId })
    .from(courseChapters)
    .innerJoin(courses, eq(courses.id, courseChapters.courseId))
    .where(eq(courseChapters.id, chapterId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError('CourseChapter', chapterId);
  // Allow public (orgId null) read-only path; writes must match org
  if (row.orgId && row.orgId !== orgId) {
    throw new ForbiddenError('Chapter belongs to a different organization');
  }
  return row;
}

/** Ensure the group scheme session belongs to a scheme owned by the current org. */
async function assertGroupSessionInOrg(schemeSessionId: string, orgId: string) {
  const rows = await db
    .select({
      sessionId: groupSchemeSessions.id,
      schemeId: groupSchemes.id,
      orgId: groupSchemes.orgId,
    })
    .from(groupSchemeSessions)
    .innerJoin(groupSchemes, eq(groupSchemes.id, groupSchemeSessions.schemeId))
    .where(eq(groupSchemeSessions.id, schemeSessionId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError('GroupSchemeSession', schemeSessionId);
  if (row.orgId && row.orgId !== orgId) {
    throw new ForbiddenError('Session belongs to a different organization');
  }
  return row;
}

// ─── Queries ────────────────────────────────────────────────────────

export async function listBlocksForCourseChapter(chapterId: string, orgId: string) {
  await assertCourseChapterInOrg(chapterId, orgId);
  return db
    .select()
    .from(courseContentBlocks)
    .where(eq(courseContentBlocks.chapterId, chapterId))
    .orderBy(asc(courseContentBlocks.sortOrder));
}

export async function listBlocksForGroupSession(schemeSessionId: string, orgId: string) {
  await assertGroupSessionInOrg(schemeSessionId, orgId);
  return db
    .select()
    .from(groupSessionBlocks)
    .where(eq(groupSessionBlocks.schemeSessionId, schemeSessionId))
    .orderBy(asc(groupSessionBlocks.sortOrder));
}

/**
 * Batch list for multiple chapters at once — used by CourseDetail to hydrate
 * the whole course view in one round-trip.
 */
export async function listBlocksForChapters(chapterIds: string[]) {
  if (chapterIds.length === 0) return [];
  return db
    .select()
    .from(courseContentBlocks)
    .where(inArray(courseContentBlocks.chapterId, chapterIds))
    .orderBy(asc(courseContentBlocks.sortOrder));
}

export async function listBlocksForSchemeSessions(sessionIds: string[]) {
  if (sessionIds.length === 0) return [];
  return db
    .select()
    .from(groupSessionBlocks)
    .where(inArray(groupSessionBlocks.schemeSessionId, sessionIds))
    .orderBy(asc(groupSessionBlocks.sortOrder));
}

// ─── Create ─────────────────────────────────────────────────────────

export interface CreateBlockInput {
  parentType: ParentType;
  /** chapter_id when parentType='course', scheme_session_id when 'group'. */
  parentId: string;
  blockType: string;
  visibility?: string;
  sortOrder?: number;
  payload?: unknown;
  createdBy: string;
  orgId: string;
}

export async function createBlock(input: CreateBlockInput) {
  assertBlockType(input.blockType);
  const visibility = input.visibility ?? (input.parentType === 'course' ? 'participant' : 'both');
  assertVisibility(visibility);

  if (input.parentType === 'course') {
    await assertCourseChapterInOrg(input.parentId, input.orgId);
    const [row] = await db
      .insert(courseContentBlocks)
      .values({
        chapterId: input.parentId,
        blockType: input.blockType,
        visibility,
        sortOrder: input.sortOrder ?? 0,
        payload: (input.payload ?? {}) as any,
        createdBy: input.createdBy,
      })
      .returning();
    return row;
  } else {
    await assertGroupSessionInOrg(input.parentId, input.orgId);
    const [row] = await db
      .insert(groupSessionBlocks)
      .values({
        schemeSessionId: input.parentId,
        blockType: input.blockType,
        visibility,
        sortOrder: input.sortOrder ?? 0,
        payload: (input.payload ?? {}) as any,
        createdBy: input.createdBy,
      })
      .returning();
    return row;
  }
}

// ─── Update ─────────────────────────────────────────────────────────

export interface UpdateBlockInput {
  parentType: ParentType;
  blockId: string;
  orgId: string;
  payload?: unknown;
  visibility?: string;
  sortOrder?: number;
}

export async function updateBlock(input: UpdateBlockInput) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.payload !== undefined) patch.payload = input.payload;
  if (input.visibility !== undefined) {
    assertVisibility(input.visibility);
    patch.visibility = input.visibility;
  }
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

  if (input.parentType === 'course') {
    const existing = await db
      .select({ chapterId: courseContentBlocks.chapterId })
      .from(courseContentBlocks)
      .where(eq(courseContentBlocks.id, input.blockId))
      .limit(1);
    if (!existing[0]) throw new NotFoundError('CourseContentBlock', input.blockId);
    await assertCourseChapterInOrg(existing[0].chapterId, input.orgId);
    const [row] = await db
      .update(courseContentBlocks)
      .set(patch as any)
      .where(eq(courseContentBlocks.id, input.blockId))
      .returning();
    return row;
  } else {
    const existing = await db
      .select({ schemeSessionId: groupSessionBlocks.schemeSessionId })
      .from(groupSessionBlocks)
      .where(eq(groupSessionBlocks.id, input.blockId))
      .limit(1);
    if (!existing[0]) throw new NotFoundError('GroupSessionBlock', input.blockId);
    await assertGroupSessionInOrg(existing[0].schemeSessionId, input.orgId);
    const [row] = await db
      .update(groupSessionBlocks)
      .set(patch as any)
      .where(eq(groupSessionBlocks.id, input.blockId))
      .returning();
    return row;
  }
}

// ─── Delete ─────────────────────────────────────────────────────────

export async function deleteBlock(parentType: ParentType, blockId: string, orgId: string) {
  if (parentType === 'course') {
    const existing = await db
      .select({ chapterId: courseContentBlocks.chapterId })
      .from(courseContentBlocks)
      .where(eq(courseContentBlocks.id, blockId))
      .limit(1);
    if (!existing[0]) throw new NotFoundError('CourseContentBlock', blockId);
    await assertCourseChapterInOrg(existing[0].chapterId, orgId);
    await db.delete(courseContentBlocks).where(eq(courseContentBlocks.id, blockId));
  } else {
    const existing = await db
      .select({ schemeSessionId: groupSessionBlocks.schemeSessionId })
      .from(groupSessionBlocks)
      .where(eq(groupSessionBlocks.id, blockId))
      .limit(1);
    if (!existing[0]) throw new NotFoundError('GroupSessionBlock', blockId);
    await assertGroupSessionInOrg(existing[0].schemeSessionId, orgId);
    await db.delete(groupSessionBlocks).where(eq(groupSessionBlocks.id, blockId));
  }
}

// ─── Reorder (batch sort update) ────────────────────────────────────

export async function reorderBlocks(
  parentType: ParentType,
  parentId: string,
  orderedIds: string[],
  orgId: string,
) {
  if (parentType === 'course') {
    await assertCourseChapterInOrg(parentId, orgId);
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(courseContentBlocks)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(
          and(
            eq(courseContentBlocks.id, orderedIds[i]),
            eq(courseContentBlocks.chapterId, parentId),
          ),
        );
    }
  } else {
    await assertGroupSessionInOrg(parentId, orgId);
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(groupSessionBlocks)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(
          and(
            eq(groupSessionBlocks.id, orderedIds[i]),
            eq(groupSessionBlocks.schemeSessionId, parentId),
          ),
        );
    }
  }
}

// ─── Visibility filter (used by portal/rendering layer) ─────────────

/**
 * Filter a block list by the caller's role. Participants see only 'participant' + 'both';
 * facilitators see everything.
 */
export function filterByRole(
  blocks: Array<{ visibility: string }>,
  role: 'participant' | 'facilitator',
) {
  if (role === 'facilitator') return blocks;
  return blocks.filter((b) => b.visibility === 'participant' || b.visibility === 'both');
}

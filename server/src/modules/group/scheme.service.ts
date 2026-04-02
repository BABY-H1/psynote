import { eq, and, or, isNull, asc, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { groupSchemes, groupSchemeSessions } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listSchemes(orgId: string) {
  return db
    .select()
    .from(groupSchemes)
    .where(
      or(
        eq(groupSchemes.orgId, orgId),
        and(isNull(groupSchemes.orgId), eq(groupSchemes.isPublic, true)),
      ),
    )
    .orderBy(desc(groupSchemes.createdAt));
}

export async function getSchemeById(schemeId: string) {
  const [scheme] = await db
    .select()
    .from(groupSchemes)
    .where(eq(groupSchemes.id, schemeId))
    .limit(1);

  if (!scheme) throw new NotFoundError('GroupScheme', schemeId);

  const sessions = await db
    .select()
    .from(groupSchemeSessions)
    .where(eq(groupSchemeSessions.schemeId, schemeId))
    .orderBy(asc(groupSchemeSessions.sortOrder));

  return { ...scheme, sessions };
}

export async function createScheme(input: {
  orgId: string;
  title: string;
  description?: string;
  theory?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
  createdBy: string;
  sessions?: {
    title: string;
    goal?: string;
    activities?: string;
    materials?: string;
    duration?: string;
    sortOrder?: number;
    relatedAssessmentId?: string;
  }[];
}) {
  const [scheme] = await db.insert(groupSchemes).values({
    orgId: input.orgId,
    title: input.title,
    description: input.description,
    theory: input.theory,
    category: input.category,
    tags: input.tags || [],
    isPublic: input.isPublic || false,
    createdBy: input.createdBy,
  }).returning();

  if (input.sessions && input.sessions.length > 0) {
    await db.insert(groupSchemeSessions).values(
      input.sessions.map((s, idx) => ({
        schemeId: scheme.id,
        title: s.title,
        goal: s.goal,
        activities: s.activities,
        materials: s.materials,
        duration: s.duration,
        sortOrder: s.sortOrder ?? idx,
        relatedAssessmentId: s.relatedAssessmentId || null,
      })),
    );
  }

  return getSchemeById(scheme.id);
}

export async function updateScheme(
  schemeId: string,
  updates: Partial<{
    title: string;
    description: string;
    theory: string;
    category: string;
    tags: string[];
    isPublic: boolean;
  }>,
) {
  const [updated] = await db
    .update(groupSchemes)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(groupSchemes.id, schemeId))
    .returning();

  if (!updated) throw new NotFoundError('GroupScheme', schemeId);
  return updated;
}

export async function deleteScheme(schemeId: string) {
  const [deleted] = await db
    .delete(groupSchemes)
    .where(eq(groupSchemes.id, schemeId))
    .returning();

  if (!deleted) throw new NotFoundError('GroupScheme', schemeId);
  return deleted;
}

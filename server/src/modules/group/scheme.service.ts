import { eq, and, or, asc, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { groupSchemes, groupSchemeSessions } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listSchemes(orgId: string, userId?: string) {
  const schemes = await db
    .select()
    .from(groupSchemes)
    .where(
      or(
        eq(groupSchemes.visibility, 'public'),
        and(eq(groupSchemes.orgId, orgId), eq(groupSchemes.visibility, 'organization')),
        ...(userId
          ? [and(eq(groupSchemes.createdBy, userId), eq(groupSchemes.visibility, 'personal'))]
          : []),
      ),
    )
    .orderBy(desc(groupSchemes.createdAt));

  if (schemes.length === 0) return [];

  const allSessions = await db
    .select()
    .from(groupSchemeSessions)
    .where(or(...schemes.map((s) => eq(groupSchemeSessions.schemeId, s.id))))
    .orderBy(asc(groupSchemeSessions.sortOrder));

  const sessionsByScheme = new Map<string, typeof allSessions>();
  for (const sess of allSessions) {
    const arr = sessionsByScheme.get(sess.schemeId) || [];
    arr.push(sess);
    sessionsByScheme.set(sess.schemeId, arr);
  }

  return schemes.map((s) => ({
    ...s,
    sessions: sessionsByScheme.get(s.id) || [],
  }));
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

interface SchemeInput {
  orgId: string;
  title: string;
  description?: string;
  theory?: string;
  overallGoal?: string;
  specificGoals?: string[];
  targetAudience?: string;
  ageRange?: string;
  selectionCriteria?: string;
  recommendedSize?: string;
  totalSessions?: number;
  sessionDuration?: string;
  frequency?: string;
  facilitatorRequirements?: string;
  evaluationMethod?: string;
  notes?: string;
  recruitmentAssessments?: string[];
  overallAssessments?: string[];
  screeningNotes?: string;
  visibility?: string;
  createdBy: string;
  sessions?: SessionInput[];
}

interface SessionInput {
  title: string;
  goal?: string;
  phases?: { name: string; duration?: string; description?: string; facilitatorNotes?: string }[];
  materials?: string;
  duration?: string;
  homework?: string;
  assessmentNotes?: string;
  relatedGoals?: number[];
  sessionTheory?: string;
  sessionEvaluation?: string;
  sortOrder?: number;
  relatedAssessments?: string[];
}

export async function createScheme(input: SchemeInput) {
  const [scheme] = await db.insert(groupSchemes).values({
    orgId: input.orgId,
    title: input.title,
    description: input.description,
    theory: input.theory,
    overallGoal: input.overallGoal,
    specificGoals: input.specificGoals || [],
    targetAudience: input.targetAudience,
    ageRange: input.ageRange,
    selectionCriteria: input.selectionCriteria,
    recommendedSize: input.recommendedSize,
    totalSessions: input.totalSessions,
    sessionDuration: input.sessionDuration,
    frequency: input.frequency,
    facilitatorRequirements: input.facilitatorRequirements,
    evaluationMethod: input.evaluationMethod,
    notes: input.notes,
    recruitmentAssessments: input.recruitmentAssessments || [],
    overallAssessments: input.overallAssessments || [],
    screeningNotes: input.screeningNotes,
    visibility: input.visibility || 'personal',
    createdBy: input.createdBy,
  }).returning();

  if (input.sessions && input.sessions.length > 0) {
    await db.insert(groupSchemeSessions).values(
      input.sessions.map((s, idx) => ({
        schemeId: scheme.id,
        title: s.title,
        goal: s.goal,
        phases: s.phases || [],
        materials: s.materials,
        duration: s.duration,
        homework: s.homework,
        assessmentNotes: s.assessmentNotes,
        relatedGoals: s.relatedGoals || [],
        sessionTheory: s.sessionTheory,
        sessionEvaluation: s.sessionEvaluation,
        sortOrder: s.sortOrder ?? idx,
        relatedAssessments: s.relatedAssessments || [],
      })),
    );
  }

  return getSchemeById(scheme.id);
}

export async function updateScheme(
  schemeId: string,
  updates: Partial<Omit<SchemeInput, 'orgId' | 'createdBy' | 'sessions'>>,
  sessions?: SessionInput[],
) {
  const [updated] = await db
    .update(groupSchemes)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(groupSchemes.id, schemeId))
    .returning();

  if (!updated) throw new NotFoundError('GroupScheme', schemeId);

  if (sessions !== undefined) {
    await db.delete(groupSchemeSessions).where(eq(groupSchemeSessions.schemeId, schemeId));
    if (sessions.length > 0) {
      await db.insert(groupSchemeSessions).values(
        sessions.map((s, idx) => ({
          schemeId,
          title: s.title,
          goal: s.goal,
          phases: s.phases || [],
          materials: s.materials,
          duration: s.duration,
          homework: s.homework,
          assessmentNotes: s.assessmentNotes,
          relatedGoals: s.relatedGoals || [],
          sessionTheory: s.sessionTheory,
          sessionEvaluation: s.sessionEvaluation,
          sortOrder: s.sortOrder ?? idx,
        })),
      );
    }
  }

  return getSchemeById(schemeId);
}

export async function deleteScheme(schemeId: string) {
  const [deleted] = await db
    .delete(groupSchemes)
    .where(eq(groupSchemes.id, schemeId))
    .returning();

  if (!deleted) throw new NotFoundError('GroupScheme', schemeId);
  return deleted;
}

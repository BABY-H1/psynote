import { eq, and, or, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { treatmentGoalLibrary } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listGoals(
  orgId: string,
  userId: string,
  filters?: { problemArea?: string; category?: string; visibility?: string },
) {
  const conditions = [
    or(
      and(eq(treatmentGoalLibrary.visibility, 'personal'), eq(treatmentGoalLibrary.createdBy, userId)),
      and(eq(treatmentGoalLibrary.visibility, 'organization'), eq(treatmentGoalLibrary.orgId, orgId)),
      eq(treatmentGoalLibrary.visibility, 'public'),
    )!,
  ];
  if (filters?.problemArea) conditions.push(eq(treatmentGoalLibrary.problemArea, filters.problemArea));
  if (filters?.category) conditions.push(eq(treatmentGoalLibrary.category, filters.category));

  return db
    .select()
    .from(treatmentGoalLibrary)
    .where(and(...conditions))
    .orderBy(desc(treatmentGoalLibrary.updatedAt));
}

export async function getGoal(goalId: string) {
  const [goal] = await db.select().from(treatmentGoalLibrary).where(eq(treatmentGoalLibrary.id, goalId)).limit(1);
  if (!goal) throw new NotFoundError('TreatmentGoalLibrary', goalId);
  return goal;
}

export async function createGoal(input: {
  orgId: string;
  title: string;
  description?: string;
  problemArea: string;
  category?: string;
  objectivesTemplate?: string[];
  interventionSuggestions?: string[];
  visibility?: string;
  createdBy: string;
}) {
  const [goal] = await db.insert(treatmentGoalLibrary).values({
    orgId: input.orgId,
    title: input.title,
    description: input.description,
    problemArea: input.problemArea,
    category: input.category,
    objectivesTemplate: input.objectivesTemplate || [],
    interventionSuggestions: input.interventionSuggestions || [],
    visibility: input.visibility || 'personal',
    createdBy: input.createdBy,
  }).returning();
  return goal;
}

export async function updateGoal(
  goalId: string,
  updates: { title?: string; description?: string; problemArea?: string; category?: string; objectivesTemplate?: string[]; interventionSuggestions?: string[]; visibility?: string },
) {
  const [updated] = await db
    .update(treatmentGoalLibrary)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(treatmentGoalLibrary.id, goalId))
    .returning();
  if (!updated) throw new NotFoundError('TreatmentGoalLibrary', goalId);
  return updated;
}

export async function deleteGoal(goalId: string) {
  const [deleted] = await db.delete(treatmentGoalLibrary).where(eq(treatmentGoalLibrary.id, goalId)).returning();
  if (!deleted) throw new NotFoundError('TreatmentGoalLibrary', goalId);
  return deleted;
}

import { db } from '../../config/database.js';
import { clientAssignments } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';

export async function listAssignments(orgId: string, counselorId?: string) {
  const conditions = [eq(clientAssignments.orgId, orgId)];
  if (counselorId) conditions.push(eq(clientAssignments.counselorId, counselorId));
  return db.select().from(clientAssignments).where(and(...conditions));
}

export async function createAssignment(input: {
  orgId: string; clientId: string; counselorId: string; isPrimary?: boolean;
}) {
  const [assignment] = await db.insert(clientAssignments).values({
    orgId: input.orgId,
    clientId: input.clientId,
    counselorId: input.counselorId,
    isPrimary: input.isPrimary ?? true,
  }).onConflictDoNothing().returning();
  return assignment;
}

export async function deleteAssignment(assignmentId: string) {
  const [deleted] = await db.delete(clientAssignments).where(eq(clientAssignments.id, assignmentId)).returning();
  return deleted;
}

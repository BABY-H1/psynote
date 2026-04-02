import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { sessionNotes, careTimeline } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listSessionNotes(
  orgId: string,
  filters?: { counselorId?: string; clientId?: string; careEpisodeId?: string },
) {
  const conditions = [eq(sessionNotes.orgId, orgId)];
  if (filters?.counselorId) conditions.push(eq(sessionNotes.counselorId, filters.counselorId));
  if (filters?.clientId) conditions.push(eq(sessionNotes.clientId, filters.clientId));
  if (filters?.careEpisodeId) conditions.push(eq(sessionNotes.careEpisodeId, filters.careEpisodeId));

  return db
    .select()
    .from(sessionNotes)
    .where(and(...conditions))
    .orderBy(desc(sessionNotes.sessionDate));
}

export async function getSessionNoteById(noteId: string) {
  const [note] = await db
    .select()
    .from(sessionNotes)
    .where(eq(sessionNotes.id, noteId))
    .limit(1);

  if (!note) throw new NotFoundError('SessionNote', noteId);
  return note;
}

export async function createSessionNote(input: {
  orgId: string;
  careEpisodeId?: string;
  appointmentId?: string;
  clientId: string;
  counselorId: string;
  sessionDate: string;
  duration?: number;
  sessionType?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  summary?: string;
  tags?: string[];
}) {
  const [note] = await db.insert(sessionNotes).values({
    orgId: input.orgId,
    careEpisodeId: input.careEpisodeId || null,
    appointmentId: input.appointmentId || null,
    clientId: input.clientId,
    counselorId: input.counselorId,
    sessionDate: input.sessionDate,
    duration: input.duration,
    sessionType: input.sessionType,
    subjective: input.subjective,
    objective: input.objective,
    assessment: input.assessment,
    plan: input.plan,
    summary: input.summary,
    tags: input.tags || [],
  }).returning();

  // Add to episode timeline
  if (input.careEpisodeId) {
    await db.insert(careTimeline).values({
      careEpisodeId: input.careEpisodeId,
      eventType: 'session_note',
      refId: note.id,
      title: '咨询记录',
      summary: input.summary || `${input.sessionDate} ${input.sessionType || '咨询'}`,
      metadata: { duration: input.duration, sessionType: input.sessionType },
      createdBy: input.counselorId,
    });
  }

  return note;
}

export async function updateSessionNote(
  noteId: string,
  updates: Partial<{
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    summary: string;
    tags: string[];
  }>,
) {
  const [updated] = await db
    .update(sessionNotes)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(sessionNotes.id, noteId))
    .returning();

  if (!updated) throw new NotFoundError('SessionNote', noteId);
  return updated;
}

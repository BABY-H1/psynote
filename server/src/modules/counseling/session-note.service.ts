import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { sessionNotes, careTimeline } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import type { DataScope } from '../../middleware/data-scope.js';
import { clientScopeCondition } from '../../lib/data-scope-filter.js';

export async function listSessionNotes(
  orgId: string,
  filters?: { counselorId?: string; clientId?: string; careEpisodeId?: string; scope?: DataScope },
) {
  const conditions = [eq(sessionNotes.orgId, orgId)];
  if (filters?.scope) conditions.push(clientScopeCondition(filters.scope, sessionNotes.clientId, sessionNotes.orgId, orgId));
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

/** Get unified fields regardless of note format */
export function getNoteFieldsUnified(note: typeof sessionNotes.$inferSelect): Record<string, string> {
  if (note.noteFormat === 'soap') {
    const result: Record<string, string> = {};
    if (note.subjective) result.subjective = note.subjective;
    if (note.objective) result.objective = note.objective;
    if (note.assessment) result.assessment = note.assessment;
    if (note.plan) result.plan = note.plan;
    return result;
  }
  return (note.fields as Record<string, string>) || {};
}

export async function createSessionNote(input: {
  orgId: string;
  careEpisodeId?: string;
  appointmentId?: string;
  clientId: string;
  counselorId: string;
  noteFormat?: string;
  templateId?: string;
  sessionDate: string;
  duration?: number;
  sessionType?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  fields?: Record<string, string>;
  summary?: string;
  tags?: string[];
}) {
  const format = input.noteFormat || 'soap';

  const [note] = await db.insert(sessionNotes).values({
    orgId: input.orgId,
    careEpisodeId: input.careEpisodeId || null,
    appointmentId: input.appointmentId || null,
    clientId: input.clientId,
    counselorId: input.counselorId,
    noteFormat: format,
    templateId: input.templateId || null,
    sessionDate: input.sessionDate,
    duration: input.duration,
    sessionType: input.sessionType,
    // SOAP columns (only for soap format)
    subjective: format === 'soap' ? input.subjective : null,
    objective: format === 'soap' ? input.objective : null,
    assessment: format === 'soap' ? input.assessment : null,
    plan: format === 'soap' ? input.plan : null,
    // Generic fields (for non-SOAP formats)
    fields: format !== 'soap' ? (input.fields || {}) : {},
    summary: input.summary,
    tags: input.tags || [],
  }).returning();

  // Add to episode timeline
  if (input.careEpisodeId) {
    const formatLabel = { soap: 'SOAP', dap: 'DAP', birp: 'BIRP', custom: '自定义' }[format] || format;
    await db.insert(careTimeline).values({
      careEpisodeId: input.careEpisodeId,
      eventType: 'session_note',
      refId: note.id,
      title: `咨询记录 (${formatLabel})`,
      summary: input.summary || `${input.sessionDate} ${input.sessionType || '咨询'}`,
      metadata: { duration: input.duration, sessionType: input.sessionType, noteFormat: format },
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
    fields: Record<string, string>;
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

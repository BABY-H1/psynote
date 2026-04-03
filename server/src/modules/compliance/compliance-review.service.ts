import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { complianceReviews, sessionNotes, treatmentPlans } from '../../db/schema.js';
import { getNoteFieldsUnified } from '../counseling/session-note.service.js';
import { BUILT_IN_FORMATS } from '../counseling/note-template.service.js';
import {
  reviewNoteCompliance,
  assessGoldenThread,
  assessTreatmentQuality,
} from '../ai/pipelines/compliance-review.js';

export async function runNoteComplianceReview(noteId: string) {
  const [note] = await db.select().from(sessionNotes).where(eq(sessionNotes.id, noteId)).limit(1);
  if (!note) throw new Error('Note not found');

  const fields = getNoteFieldsUnified(note);
  const format = note.noteFormat || 'soap';

  // Get field labels
  const builtIn = BUILT_IN_FORMATS.find((f) => f.format === format);
  const fieldLabels: Record<string, string> = {};
  if (builtIn) {
    builtIn.fieldDefinitions.forEach((f) => { fieldLabels[f.key] = f.label; });
  }

  const result = await reviewNoteCompliance({ noteFormat: format, fields, fieldLabels });

  const [review] = await db.insert(complianceReviews).values({
    orgId: note.orgId,
    careEpisodeId: note.careEpisodeId!,
    noteId: note.id,
    counselorId: note.counselorId,
    reviewType: 'note_compliance',
    score: result.score,
    findings: result.findings,
  }).returning();

  return review;
}

export async function runGoldenThreadReview(orgId: string, episodeId: string) {
  // Get active treatment plan
  const [plan] = await db.select().from(treatmentPlans)
    .where(and(eq(treatmentPlans.careEpisodeId, episodeId), eq(treatmentPlans.status, 'active')))
    .limit(1);

  if (!plan) throw new Error('No active treatment plan');

  const goals = ((plan.goals as any[]) || []).map((g: any) => ({
    description: g.description,
    status: g.status,
  }));

  // Get recent notes (last 5)
  const notes = await db.select().from(sessionNotes)
    .where(and(eq(sessionNotes.orgId, orgId), eq(sessionNotes.careEpisodeId, episodeId)))
    .orderBy(desc(sessionNotes.sessionDate))
    .limit(5);

  const recentNotes = notes.map((n) => ({
    date: String(n.sessionDate),
    fields: getNoteFieldsUnified(n),
  }));

  const result = await assessGoldenThread({ treatmentGoals: goals, recentNotes });

  const [review] = await db.insert(complianceReviews).values({
    orgId,
    careEpisodeId: episodeId,
    counselorId: plan.counselorId,
    reviewType: 'golden_thread',
    goldenThreadScore: result.goldenThreadScore,
    findings: result.gaps.map((g) => ({ category: 'alignment_gap', severity: 'warning', description: g, suggestion: '' })),
  }).returning();

  return { ...review, alignmentDetails: result.alignmentDetails };
}

export async function runQualityAssessment(noteId: string) {
  const [note] = await db.select().from(sessionNotes).where(eq(sessionNotes.id, noteId)).limit(1);
  if (!note) throw new Error('Note not found');

  const fields = getNoteFieldsUnified(note);
  const result = await assessTreatmentQuality({
    noteFormat: note.noteFormat || 'soap',
    fields,
  });

  const [review] = await db.insert(complianceReviews).values({
    orgId: note.orgId,
    careEpisodeId: note.careEpisodeId!,
    noteId: note.id,
    counselorId: note.counselorId,
    reviewType: 'treatment_quality',
    score: result.overallScore,
    qualityIndicators: result.qualityIndicators,
    findings: [
      ...result.strengths.map((s) => ({ category: 'strength', severity: 'info' as const, description: s, suggestion: '' })),
      ...result.growthAreas.map((g) => ({ category: 'growth', severity: 'info' as const, description: g, suggestion: '' })),
    ],
  }).returning();

  return { ...review, narrative: result.narrative, strengths: result.strengths, growthAreas: result.growthAreas, qualityIndicators: result.qualityIndicators };
}

export async function listReviews(
  orgId: string,
  filters?: { careEpisodeId?: string; noteId?: string; reviewType?: string; counselorId?: string },
) {
  const conditions = [eq(complianceReviews.orgId, orgId)];
  if (filters?.careEpisodeId) conditions.push(eq(complianceReviews.careEpisodeId, filters.careEpisodeId));
  if (filters?.noteId) conditions.push(eq(complianceReviews.noteId, filters.noteId));
  if (filters?.reviewType) conditions.push(eq(complianceReviews.reviewType, filters.reviewType));
  if (filters?.counselorId) conditions.push(eq(complianceReviews.counselorId, filters.counselorId));

  return db.select().from(complianceReviews)
    .where(and(...conditions))
    .orderBy(desc(complianceReviews.reviewedAt));
}

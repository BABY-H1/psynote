import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  sessionNotes, assessmentResults, treatmentPlans,
  careEpisodes, careTimeline, users,
} from '../../db/schema.js';
import { generateCaseProgressReport } from '../ai/pipelines/case-progress-report.js';

export async function buildAndGenerateCaseProgressReport(
  orgId: string,
  episodeId: string,
) {
  // Episode
  const [episode] = await db.select().from(careEpisodes).where(eq(careEpisodes.id, episodeId)).limit(1);
  if (!episode) throw new Error('Episode not found');

  // Client name
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, episode.clientId)).limit(1);

  // Session notes (all for this episode)
  const notes = await db.select({
    sessionDate: sessionNotes.sessionDate,
    summary: sessionNotes.summary,
    subjective: sessionNotes.subjective,
    assessment: sessionNotes.assessment,
    plan: sessionNotes.plan,
    tags: sessionNotes.tags,
  }).from(sessionNotes)
    .where(and(eq(sessionNotes.orgId, orgId), eq(sessionNotes.careEpisodeId, episodeId)))
    .orderBy(sessionNotes.sessionDate);

  // Assessment results for this client
  const results = await db.select({
    createdAt: assessmentResults.createdAt,
    totalScore: assessmentResults.totalScore,
    riskLevel: assessmentResults.riskLevel,
  }).from(assessmentResults)
    .where(eq(assessmentResults.userId, episode.clientId))
    .orderBy(assessmentResults.createdAt);

  // Risk changes from timeline
  const riskEvents = await db.select({
    createdAt: careTimeline.createdAt,
    metadata: careTimeline.metadata,
  }).from(careTimeline)
    .where(and(eq(careTimeline.careEpisodeId, episodeId), eq(careTimeline.eventType, 'risk_change')))
    .orderBy(careTimeline.createdAt);

  // Active treatment plan goals
  const [plan] = await db.select().from(treatmentPlans)
    .where(and(eq(treatmentPlans.careEpisodeId, episodeId), eq(treatmentPlans.status, 'active')))
    .limit(1);

  const riskChanges = riskEvents.map((e) => {
    const meta = e.metadata as Record<string, any>;
    return {
      date: new Date(e.createdAt).toISOString().slice(0, 10),
      from: meta.riskBefore || meta.from || '',
      to: meta.riskAfter || meta.to || '',
    };
  });

  return generateCaseProgressReport({
    clientName: user?.name,
    chiefComplaint: episode.chiefComplaint || undefined,
    currentRisk: episode.currentRisk,
    sessionNotes: notes.map((n) => ({
      date: String(n.sessionDate),
      summary: n.summary || undefined,
      subjective: n.subjective || undefined,
      assessment: n.assessment || undefined,
      plan: n.plan || undefined,
      tags: (n.tags as string[]) || undefined,
    })),
    assessmentResults: results.map((r) => ({
      date: new Date(r.createdAt).toISOString().slice(0, 10),
      totalScore: Number(r.totalScore) || 0,
      riskLevel: r.riskLevel || 'level_1',
    })),
    riskChanges,
    treatmentGoals: ((plan?.goals as any[]) || []).map((g: any) => ({
      description: g.description,
      status: g.status,
    })),
  });
}

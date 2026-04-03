import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  clientProfiles, sessionNotes, assessmentResults, treatmentPlans,
  careEpisodes, users,
} from '../../db/schema.js';
import { generateClientSummary } from '../ai/pipelines/client-summary.js';

export async function buildAndGenerateClientSummary(
  orgId: string,
  clientId: string,
  episodeId: string,
) {
  // Client name
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, clientId)).limit(1);

  // Episode
  const [episode] = await db.select().from(careEpisodes).where(eq(careEpisodes.id, episodeId)).limit(1);

  // Profile
  const [profile] = await db.select().from(clientProfiles)
    .where(and(eq(clientProfiles.orgId, orgId), eq(clientProfiles.userId, clientId)))
    .limit(1);

  // Recent session notes (last 5)
  const notes = await db.select({
    sessionDate: sessionNotes.sessionDate,
    summary: sessionNotes.summary,
    tags: sessionNotes.tags,
  }).from(sessionNotes)
    .where(and(eq(sessionNotes.orgId, orgId), eq(sessionNotes.clientId, clientId)))
    .orderBy(desc(sessionNotes.sessionDate))
    .limit(5);

  // Assessment results (last 5)
  const results = await db.select({
    createdAt: assessmentResults.createdAt,
    totalScore: assessmentResults.totalScore,
    riskLevel: assessmentResults.riskLevel,
    dimensionScores: assessmentResults.dimensionScores,
  }).from(assessmentResults)
    .where(eq(assessmentResults.userId, clientId))
    .orderBy(desc(assessmentResults.createdAt))
    .limit(5);

  // Active treatment plan
  const [plan] = await db.select().from(treatmentPlans)
    .where(and(eq(treatmentPlans.careEpisodeId, episodeId), eq(treatmentPlans.status, 'active')))
    .limit(1);

  // Build age from DOB
  let age: number | undefined;
  if (profile?.dateOfBirth) {
    const dob = new Date(profile.dateOfBirth);
    age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 86400000));
  }

  return generateClientSummary({
    clientName: user?.name,
    chiefComplaint: episode?.chiefComplaint || undefined,
    currentRisk: episode?.currentRisk || 'level_1',
    profile: profile ? {
      gender: profile.gender || undefined,
      age,
      occupation: profile.occupation || undefined,
      presentingIssues: (profile.presentingIssues as string[]) || undefined,
      medicalHistory: profile.medicalHistory || undefined,
      familyBackground: profile.familyBackground || undefined,
    } : undefined,
    sessionSummaries: notes.filter((n) => n.summary).map((n) => ({
      date: String(n.sessionDate),
      summary: n.summary!,
      tags: (n.tags as string[]) || undefined,
    })),
    assessmentResults: results.map((r) => ({
      date: new Date(r.createdAt).toISOString().slice(0, 10),
      totalScore: Number(r.totalScore) || 0,
      riskLevel: r.riskLevel || 'level_1',
      dimensions: r.dimensionScores as Record<string, number> | undefined,
    })),
    treatmentPlan: plan ? {
      title: plan.title || undefined,
      approach: plan.approach || undefined,
      goals: ((plan.goals as any[]) || []).map((g: any) => ({ description: g.description, status: g.status })),
    } : undefined,
  });
}

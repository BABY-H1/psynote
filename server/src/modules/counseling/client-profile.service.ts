import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { clientProfiles, careEpisodes, assessmentResults, users } from '../../db/schema.js';

export async function getProfile(orgId: string, userId: string) {
  const [profile] = await db
    .select()
    .from(clientProfiles)
    .where(and(eq(clientProfiles.orgId, orgId), eq(clientProfiles.userId, userId)))
    .limit(1);

  return profile || null;
}

export async function upsertProfile(
  orgId: string,
  userId: string,
  data: {
    phone?: string;
    gender?: string;
    dateOfBirth?: string;
    address?: string;
    occupation?: string;
    education?: string;
    maritalStatus?: string;
    emergencyContact?: { name: string; phone: string; relationship: string };
    medicalHistory?: string;
    familyBackground?: string;
    presentingIssues?: string[];
    notes?: string;
  },
) {
  const existing = await getProfile(orgId, userId);

  if (existing) {
    const [updated] = await db
      .update(clientProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clientProfiles.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(clientProfiles)
    .values({ orgId, userId, ...data })
    .returning();
  return created;
}

export async function getClientSummary(orgId: string, userId: string) {
  const profile = await getProfile(orgId, userId);

  // User basic info
  const [user] = await db
    .select({ name: users.name, email: users.email, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Active episodes
  const episodes = await db
    .select()
    .from(careEpisodes)
    .where(
      and(
        eq(careEpisodes.orgId, orgId),
        eq(careEpisodes.clientId, userId),
        eq(careEpisodes.status, 'active'),
      ),
    );

  // Recent assessment results (last 5)
  const results = await db
    .select({
      id: assessmentResults.id,
      totalScore: assessmentResults.totalScore,
      riskLevel: assessmentResults.riskLevel,
      createdAt: assessmentResults.createdAt,
    })
    .from(assessmentResults)
    .where(eq(assessmentResults.userId, userId))
    .orderBy(assessmentResults.createdAt)
    .limit(5);

  return {
    user: user || null,
    profile,
    activeEpisodes: episodes,
    recentResults: results,
  };
}

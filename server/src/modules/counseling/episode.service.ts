import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { careEpisodes, careTimeline, users } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

export async function listEpisodes(
  orgId: string,
  filters?: { counselorId?: string; clientId?: string; status?: string },
) {
  const conditions = [eq(careEpisodes.orgId, orgId)];
  if (filters?.counselorId) conditions.push(eq(careEpisodes.counselorId, filters.counselorId));
  if (filters?.clientId) conditions.push(eq(careEpisodes.clientId, filters.clientId));
  if (filters?.status) conditions.push(eq(careEpisodes.status, filters.status));

  const episodes = await db
    .select({
      episode: careEpisodes,
      clientName: users.name,
      clientEmail: users.email,
    })
    .from(careEpisodes)
    .leftJoin(users, eq(users.id, careEpisodes.clientId))
    .where(and(...conditions))
    .orderBy(desc(careEpisodes.updatedAt));

  return episodes.map((row) => ({
    ...row.episode,
    client: { name: row.clientName, email: row.clientEmail },
  }));
}

export async function getEpisodeById(episodeId: string) {
  const [row] = await db
    .select({
      episode: careEpisodes,
      clientName: users.name,
      clientEmail: users.email,
    })
    .from(careEpisodes)
    .leftJoin(users, eq(users.id, careEpisodes.clientId))
    .where(eq(careEpisodes.id, episodeId))
    .limit(1);

  if (!row) throw new NotFoundError('CareEpisode', episodeId);

  return {
    ...row.episode,
    client: { name: row.clientName, email: row.clientEmail },
  };
}

export async function createEpisode(input: {
  orgId: string;
  clientId: string;
  counselorId?: string;
  chiefComplaint?: string;
  currentRisk?: string;
  interventionType?: string;
}) {
  const [episode] = await db.insert(careEpisodes).values({
    orgId: input.orgId,
    clientId: input.clientId,
    counselorId: input.counselorId || null,
    chiefComplaint: input.chiefComplaint,
    currentRisk: input.currentRisk || 'level_1',
    interventionType: input.interventionType || null,
  }).returning();

  // Add opening event to timeline
  await db.insert(careTimeline).values({
    careEpisodeId: episode.id,
    eventType: 'note',
    title: '开启个案',
    summary: input.chiefComplaint || '新个案已创建',
    metadata: { interventionType: input.interventionType, risk: input.currentRisk },
    createdBy: input.counselorId || null,
  });

  return episode;
}

export async function updateEpisode(
  episodeId: string,
  updates: Partial<{
    counselorId: string;
    status: string;
    chiefComplaint: string;
    currentRisk: string;
    interventionType: string;
  }>,
) {
  const [updated] = await db
    .update(careEpisodes)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(careEpisodes.id, episodeId))
    .returning();

  if (!updated) throw new NotFoundError('CareEpisode', episodeId);
  return updated;
}

/** Counselor confirms/adjusts triage decision */
export async function confirmTriage(
  episodeId: string,
  decision: {
    currentRisk: string;
    interventionType: string;
    note?: string;
    confirmedBy: string;
  },
) {
  const [updated] = await db
    .update(careEpisodes)
    .set({
      currentRisk: decision.currentRisk,
      interventionType: decision.interventionType,
      updatedAt: new Date(),
    })
    .where(eq(careEpisodes.id, episodeId))
    .returning();

  if (!updated) throw new NotFoundError('CareEpisode', episodeId);

  // Record triage decision in timeline
  await db.insert(careTimeline).values({
    careEpisodeId: episodeId,
    eventType: 'triage_decision',
    title: '分流决定已确认',
    summary: decision.note || `风险等级: ${decision.currentRisk}, 干预方式: ${decision.interventionType}`,
    metadata: {
      riskLevel: decision.currentRisk,
      interventionType: decision.interventionType,
      confirmed: true,
    },
    createdBy: decision.confirmedBy,
  });

  return updated;
}

/** Close a care episode */
export async function closeEpisode(episodeId: string, closedBy: string, reason?: string) {
  const [updated] = await db
    .update(careEpisodes)
    .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
    .where(eq(careEpisodes.id, episodeId))
    .returning();

  if (!updated) throw new NotFoundError('CareEpisode', episodeId);

  await db.insert(careTimeline).values({
    careEpisodeId: episodeId,
    eventType: 'note',
    title: '个案结案',
    summary: reason || '个案已关闭',
    createdBy: closedBy,
  });

  return updated;
}

/** Get the unified timeline for an episode */
export async function getTimeline(episodeId: string) {
  return db
    .select()
    .from(careTimeline)
    .where(eq(careTimeline.careEpisodeId, episodeId))
    .orderBy(desc(careTimeline.createdAt));
}

/** Add a timeline event */
export async function addTimelineEvent(input: {
  careEpisodeId: string;
  eventType: string;
  refId?: string;
  title: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}) {
  const [event] = await db.insert(careTimeline).values(input).returning();
  return event;
}

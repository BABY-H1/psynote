import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { aiConversations, careEpisodes } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import type { DataScope } from '../../middleware/data-scope.js';

export async function listConversations(
  orgId: string,
  filters: { careEpisodeId?: string; counselorId?: string; mode?: string; scope?: DataScope },
) {
  const conditions = [eq(aiConversations.orgId, orgId)];
  if (filters.scope?.type === 'assigned' && filters.scope.allowedClientIds) {
    // AI conversations don't have a direct clientId column — filter by counselorId ownership
    // For assigned scope, restrict to conversations where the counselor is the current user
    // (the scope's allowedClientIds are already resolved from assignments)
    if (filters.counselorId) {
      // Already filtered by counselorId below, no extra condition needed
    } else {
      // Subquery: only conversations linked to episodes whose client is in allowedClientIds
      const allowedEpisodes = await db
        .select({ id: careEpisodes.id })
        .from(careEpisodes)
        .where(and(
          eq(careEpisodes.orgId, orgId),
          inArray(careEpisodes.clientId, filters.scope.allowedClientIds),
        ));
      const episodeIds = allowedEpisodes.map((e) => e.id);
      if (episodeIds.length > 0) {
        conditions.push(inArray(aiConversations.careEpisodeId, episodeIds));
      } else {
        conditions.push(eq(aiConversations.careEpisodeId, 'no-access'));
      }
    }
  } else if (filters.scope?.type === 'basic_only' || filters.scope?.type === 'none') {
    // No clinical access
    conditions.push(eq(aiConversations.careEpisodeId, 'no-access'));
  }
  if (filters.careEpisodeId) conditions.push(eq(aiConversations.careEpisodeId, filters.careEpisodeId));
  if (filters.counselorId) conditions.push(eq(aiConversations.counselorId, filters.counselorId));
  if (filters.mode) conditions.push(eq(aiConversations.mode, filters.mode));

  return db.select()
    .from(aiConversations)
    .where(and(...conditions))
    .orderBy(desc(aiConversations.updatedAt));
}

export async function getConversation(id: string) {
  const [row] = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).limit(1);
  if (!row) throw new NotFoundError('AiConversation', id);
  return row;
}

export async function createConversation(input: {
  orgId: string;
  careEpisodeId: string;
  counselorId: string;
  mode: string;
  title?: string;
  messages?: any[];
}) {
  const [row] = await db.insert(aiConversations).values({
    orgId: input.orgId,
    careEpisodeId: input.careEpisodeId,
    counselorId: input.counselorId,
    mode: input.mode,
    title: input.title || null,
    messages: input.messages || [],
  }).returning();
  return row;
}

export async function updateConversation(id: string, data: {
  messages?: any[];
  title?: string;
  summary?: string;
}) {
  const updates: any = { updatedAt: new Date() };
  if (data.messages !== undefined) updates.messages = data.messages;
  if (data.title !== undefined) updates.title = data.title;
  if (data.summary !== undefined) updates.summary = data.summary;

  const [row] = await db.update(aiConversations)
    .set(updates)
    .where(eq(aiConversations.id, id))
    .returning();
  if (!row) throw new NotFoundError('AiConversation', id);
  return row;
}

export async function deleteConversation(id: string) {
  const [row] = await db.delete(aiConversations)
    .where(eq(aiConversations.id, id))
    .returning();
  if (!row) throw new NotFoundError('AiConversation', id);
  return row;
}

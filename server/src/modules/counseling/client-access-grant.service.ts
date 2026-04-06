import { db } from '../../config/database.js';
import { clientAccessGrants } from '../../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';

export async function listActiveGrants(orgId: string, counselorId?: string) {
  const conditions = [
    eq(clientAccessGrants.orgId, orgId),
    isNull(clientAccessGrants.revokedAt),
  ];
  if (counselorId) conditions.push(eq(clientAccessGrants.grantedToCounselorId, counselorId));
  return db.select().from(clientAccessGrants).where(and(...conditions));
}

export async function createGrant(input: {
  orgId: string; clientId: string; grantedToCounselorId: string;
  grantedBy: string; reason: string; expiresAt?: string;
}) {
  const [grant] = await db.insert(clientAccessGrants).values({
    orgId: input.orgId,
    clientId: input.clientId,
    grantedToCounselorId: input.grantedToCounselorId,
    grantedBy: input.grantedBy,
    reason: input.reason,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
  }).onConflictDoNothing().returning();
  return grant;
}

export async function revokeGrant(grantId: string) {
  const [revoked] = await db.update(clientAccessGrants)
    .set({ revokedAt: new Date() })
    .where(eq(clientAccessGrants.id, grantId))
    .returning();
  return revoked;
}

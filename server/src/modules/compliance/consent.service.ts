import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  consentTemplates, clientDocuments, consentRecords, careTimeline,
} from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

// ─── Templates ──────────────────────────────────────────────────

export async function listTemplates(orgId: string) {
  return db
    .select()
    .from(consentTemplates)
    .where(eq(consentTemplates.orgId, orgId))
    .orderBy(desc(consentTemplates.updatedAt));
}

export async function createTemplate(input: {
  orgId: string;
  title: string;
  consentType: string;
  content: string;
  createdBy?: string;
}) {
  const [template] = await db
    .insert(consentTemplates)
    .values(input)
    .returning();
  return template;
}

export async function updateTemplate(
  templateId: string,
  updates: { title?: string; content?: string; consentType?: string },
) {
  const [updated] = await db
    .update(consentTemplates)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(consentTemplates.id, templateId))
    .returning();
  if (!updated) throw new NotFoundError('ConsentTemplate', templateId);
  return updated;
}

export async function deleteTemplate(templateId: string) {
  const [deleted] = await db
    .delete(consentTemplates)
    .where(eq(consentTemplates.id, templateId))
    .returning();
  if (!deleted) throw new NotFoundError('ConsentTemplate', templateId);
  return deleted;
}

// ─── Documents (counselor side) ─────────────────────────────────

export async function sendConsentToClient(input: {
  orgId: string;
  clientId: string;
  careEpisodeId?: string;
  templateId: string;
  createdBy: string;
  /**
   * Phase 13: 文书接收方.默认 'client'(发给来访者本人).
   * 'guardian' 时 client_portal 不会展示给来访者,视为线下交付给家长.
   */
  recipientType?: 'client' | 'guardian';
  recipientName?: string;
}) {
  // Load template
  const [template] = await db
    .select()
    .from(consentTemplates)
    .where(eq(consentTemplates.id, input.templateId))
    .limit(1);
  if (!template) throw new NotFoundError('ConsentTemplate', input.templateId);

  const recipientType = input.recipientType || 'client';

  // Create document with content snapshot
  const [doc] = await db
    .insert(clientDocuments)
    .values({
      orgId: input.orgId,
      clientId: input.clientId,
      careEpisodeId: input.careEpisodeId,
      templateId: input.templateId,
      title: template.title,
      content: template.content,
      docType: 'consent',
      consentType: template.consentType,
      recipientType,
      recipientName: recipientType === 'guardian' ? input.recipientName || null : null,
      // Guardian-recipient documents are marked as 'issued' instead of
      // 'pending' — there's no client-portal signing flow for guardians;
      // counselor delivers offline and the document is just 留痕.
      status: recipientType === 'guardian' ? 'issued' : 'pending',
      createdBy: input.createdBy,
    })
    .returning();

  return doc;
}

export async function listDocuments(
  orgId: string,
  filters?: { clientId?: string; status?: string; careEpisodeId?: string },
) {
  const conditions = [eq(clientDocuments.orgId, orgId)];
  if (filters?.clientId) conditions.push(eq(clientDocuments.clientId, filters.clientId));
  if (filters?.status) conditions.push(eq(clientDocuments.status, filters.status));
  if (filters?.careEpisodeId) conditions.push(eq(clientDocuments.careEpisodeId, filters.careEpisodeId));

  return db
    .select()
    .from(clientDocuments)
    .where(and(...conditions))
    .orderBy(desc(clientDocuments.createdAt));
}

export async function getDocumentById(docId: string) {
  const [doc] = await db
    .select()
    .from(clientDocuments)
    .where(eq(clientDocuments.id, docId))
    .limit(1);
  if (!doc) throw new NotFoundError('ClientDocument', docId);
  return doc;
}

// ─── Documents (client side) ────────────────────────────────────

export async function getMyDocuments(orgId: string, clientId: string) {
  // Phase 13: guardian-recipient documents are for the counselor to deliver
  // offline to a parent — the client themselves should NOT see them. Filter
  // them out here at the "my documents" boundary.
  return db
    .select()
    .from(clientDocuments)
    .where(and(
      eq(clientDocuments.orgId, orgId),
      eq(clientDocuments.clientId, clientId),
      eq(clientDocuments.recipientType, 'client'),
    ))
    .orderBy(desc(clientDocuments.createdAt));
}

export async function signDocument(
  docId: string,
  clientId: string,
  signature: {
    name: string;
    ip?: string;
    userAgent?: string;
    /**
     * Phase 14: When set, the document is being signed by a guardian on behalf
     * of the client. The user.id of the actual signer (guardian) is recorded on
     * the consent_records row via `signerOnBehalfOf` for audit traceability.
     */
    signerOnBehalfOf?: string;
  },
) {
  const doc = await getDocumentById(docId);
  if (doc.clientId !== clientId) throw new Error('Unauthorized');
  if (doc.status !== 'pending') throw new Error('Document already processed');

  const now = new Date();
  const { signerOnBehalfOf, ...sigBase } = signature;
  const signatureData: Record<string, unknown> = {
    ...sigBase,
    timestamp: now.toISOString(),
  };
  if (signerOnBehalfOf) signatureData.signerOnBehalfOf = signerOnBehalfOf;

  // Update document status
  const [signed] = await db
    .update(clientDocuments)
    .set({ status: 'signed', signedAt: now, signatureData })
    .where(eq(clientDocuments.id, docId))
    .returning();

  // Create consent record
  if (doc.consentType) {
    await db.insert(consentRecords).values({
      orgId: doc.orgId,
      clientId,
      consentType: doc.consentType,
      scope: {},
      grantedAt: now,
      documentId: docId,
      status: 'active',
      signerOnBehalfOf: signerOnBehalfOf ?? null,
    });
  }

  // Timeline event (if linked to episode)
  if (doc.careEpisodeId) {
    await db.insert(careTimeline).values({
      careEpisodeId: doc.careEpisodeId,
      eventType: 'document',
      refId: docId,
      title: signerOnBehalfOf ? '知情同意书已签署 (家长代签)' : '知情同意书已签署',
      summary: doc.title,
      metadata: { consentType: doc.consentType, signedAt: now.toISOString(), signerOnBehalfOf: signerOnBehalfOf || null },
      createdBy: signerOnBehalfOf || clientId,
    });
  }

  return signed;
}

// ─── Consent records ────────────────────────────────────────────

export async function getMyConsents(orgId: string, clientId: string) {
  return db
    .select()
    .from(consentRecords)
    .where(and(eq(consentRecords.orgId, orgId), eq(consentRecords.clientId, clientId)))
    .orderBy(desc(consentRecords.createdAt));
}

export async function revokeConsent(consentId: string, clientId: string) {
  const [record] = await db
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.id, consentId))
    .limit(1);

  if (!record) throw new NotFoundError('ConsentRecord', consentId);
  if (record.clientId !== clientId) throw new Error('Unauthorized');

  const [revoked] = await db
    .update(consentRecords)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(consentRecords.id, consentId))
    .returning();

  return revoked;
}

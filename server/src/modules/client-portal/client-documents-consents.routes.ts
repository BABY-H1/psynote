import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as consentService from '../compliance/consent.service.js';
import { resolveTargetUserId, rejectAsParam } from './client-portal-shared.js';

/**
 * Client-side consent records: documents to sign, consent list + revoke,
 * and referral consent decisions.
 *
 * Documents + consents are guardian-readable AND sign-on-behalf-of capable
 * (for parent binding flow). The sign handler tracks `signerOnBehalfOf`
 * when the caller is acting-as a child.
 *
 * Referrals are guardian-blocked — consent to a cross-org referral must
 * come from the subject themselves, even if a guardian is active.
 */
export async function clientDocumentsConsentsRoutes(app: FastifyInstance) {
  /** List my documents (pending + signed) — guardian-readable */
  app.get('/documents', async (request) => {
    const userId = await resolveTargetUserId(request);
    return consentService.getMyDocuments(request.org!.orgId, userId);
  });

  /** Get document content — guardian-readable */
  app.get('/documents/:docId', async (request) => {
    const { docId } = request.params as { docId: string };
    const userId = await resolveTargetUserId(request);
    const doc = await consentService.getDocumentById(docId);
    if (doc.clientId !== userId) throw new ValidationError('Unauthorized');
    return doc;
  });

  /**
   * Sign a document. When `?as=<childUserId>` is set, the caller
   * (guardian) is signing on behalf of the child; the consent_records row
   * captures this via `signerOnBehalfOf=<guardianUserId>` for audit.
   */
  app.post('/documents/:docId/sign', async (request) => {
    const { docId } = request.params as { docId: string };
    const body = request.body as { name: string };
    if (!body.name) throw new ValidationError('name is required');

    const callerId = request.user!.id;
    const targetUserId = await resolveTargetUserId(request);
    const signerOnBehalfOf = targetUserId !== callerId ? callerId : undefined;

    const signed = await consentService.signDocument(docId, targetUserId, {
      name: body.name,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      signerOnBehalfOf,
    });

    await logAudit(request, 'create', 'consent_records', signed.id);
    return signed;
  });

  /** List my consent records — guardian-readable */
  app.get('/consents', async (request) => {
    const userId = await resolveTargetUserId(request);
    return consentService.getMyConsents(request.org!.orgId, userId);
  });

  /** Revoke a consent — guardian-readable (and revokable on behalf of) */
  app.post('/consents/:consentId/revoke', async (request) => {
    const userId = await resolveTargetUserId(request);
    const { consentId } = request.params as { consentId: string };
    const revoked = await consentService.revokeConsent(consentId, userId);
    await logAudit(request, 'update', 'consent_records', consentId);
    return revoked;
  });

  /** List pending referrals where the calling user is the subject — guardian-blocked */
  app.get('/referrals', async (request) => {
    rejectAsParam(request);
    const userId = request.user!.id;
    const { referrals: referralsTable } = await import('../../db/schema.js');
    return db
      .select()
      .from(referralsTable)
      .where(and(
        eq(referralsTable.clientId, userId),
        eq(referralsTable.status, 'pending'),
      ));
  });

  /** Record consent decision on a pending referral — guardian-blocked */
  app.post('/referrals/:referralId/consent', async (request, reply) => {
    rejectAsParam(request);
    const userId = request.user!.id;
    const { referralId } = request.params as { referralId: string };
    const body = request.body as { consent?: boolean };
    if (typeof body.consent !== 'boolean') {
      throw new ValidationError('consent (boolean) is required');
    }

    const referralService = await import('../referral/referral.service.js');
    const updated = await referralService.recordClientConsent(referralId, userId, body.consent);
    return reply.status(200).send(updated);
  });
}

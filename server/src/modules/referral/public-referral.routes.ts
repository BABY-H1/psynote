/**
 * Phase 9δ — Public referral routes (no auth).
 *
 * Two endpoints intended to be reached without an authenticated session:
 *
 *   GET /api/public/referrals/download/:token
 *     The "external mode" one-time download link. The sender hands this URL
 *     to the receiving doctor / counselor off-platform (e.g. via email).
 *     Token + expiry are validated by the service layer. Returns the JSON
 *     data package; a future iteration can render this as a PDF.
 *
 *   POST /api/public/referrals/:referralId/consent
 *     The client portal pings this when the user clicks "我同意" / "我不同意"
 *     on a pending referral. The client must be authenticated (we still
 *     mount this on the client portal), but I'm keeping the endpoint here
 *     so the referral module owns its surface area. The portal should
 *     prefer the authenticated route for safety.
 */
import type { FastifyInstance } from 'fastify';
import * as referralService from './referral.service.js';

export async function publicReferralRoutes(app: FastifyInstance) {
  /**
   * One-time download link for external-mode referrals.
   * Anyone with the token gets the data, so the token MUST be:
   *   - high-entropy (24 random bytes)
   *   - tied to a specific referral
   *   - expired after 7 days
   * All three are enforced in the service layer.
   */
  app.get('/download/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    try {
      const data = await referralService.getByDownloadToken(token);
      // Return as JSON for now. PDF rendering can be wired later by piping
      // the same data through puppeteer / pdfkit.
      return data;
    } catch (err: any) {
      return reply.status(404).send({ error: err?.message ?? 'Not found' });
    }
  });
}

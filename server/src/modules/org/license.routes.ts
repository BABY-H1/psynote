/**
 * License management routes.
 *
 * POST /api/orgs/:orgId/license   — Activate a license key
 * DELETE /api/orgs/:orgId/license — Remove license key (revert to DB plan)
 *
 * Only org_admin can manage licenses. The license key is an RSA-signed JWT
 * issued by psynote's internal tooling. On activation the key is validated
 * (signature + orgId match) before being persisted.
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { organizations } from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError, ForbiddenError } from '../../lib/errors.js';
import { verifyLicense } from '../../lib/license/verify.js';
import { TIER_LABELS, TIER_FEATURES } from '@psynote/shared';

export async function licenseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /**
   * Activate a license key for this organization.
   * Validates the RSA signature and orgId binding before saving.
   */
  app.post('/license', {
    preHandler: [requireRole('org_admin')],
  }, async (request, reply) => {
    const orgId = request.org!.orgId;
    const { licenseKey } = request.body as { licenseKey?: string };

    if (!licenseKey || typeof licenseKey !== 'string') {
      throw new ValidationError('licenseKey is required');
    }

    // Verify signature + check orgId binding
    const result = await verifyLicense(licenseKey.trim(), orgId);

    if (!result.valid) {
      if (result.status === 'expired') {
        throw new ForbiddenError('许可证已过期，请联系供应商续期');
      }
      throw new ForbiddenError('许可证无效：签名验证失败或机构不匹配');
    }

    // Persist the license key
    await db
      .update(organizations)
      .set({ licenseKey: licenseKey.trim(), updatedAt: new Date() })
      .where(eq(organizations.id, orgId));

    // Audit log
    logAudit(request, 'license.activated', 'organization', orgId);

    const tier = result.payload!.tier;
    return {
      success: true,
      tier,
      label: TIER_LABELS[tier],
      features: Array.from(TIER_FEATURES[tier]),
      maxSeats: result.payload!.maxSeats,
      expiresAt: result.payload!.expiresAt,
    };
  });

  /**
   * Remove the license key (revert to DB plan-based tier).
   */
  app.delete('/license', {
    preHandler: [requireRole('org_admin')],
  }, async (request, reply) => {
    const orgId = request.org!.orgId;

    await db
      .update(organizations)
      .set({ licenseKey: null, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));

    logAudit(request, 'license.removed', 'organization', orgId);

    return { success: true };
  });
}

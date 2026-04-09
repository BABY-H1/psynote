import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { organizations } from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/feature-flag.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';

/**
 * Phase 7b — Organization branding routes.
 *
 *   GET   /api/orgs/:orgId/branding   — read current branding settings
 *   PATCH /api/orgs/:orgId/branding   — update branding (admin only, branding feature)
 *
 * Branding is stored inside `organizations.settings.branding` as a JSONB
 * sub-object. Shape:
 * ```
 * {
 *   logoUrl?: string
 *   themeColor?: string      // tailwind 'brand-600' replacement, e.g. '#6366f1'
 *   reportHeader?: string    // text at the top of PDF reports
 *   reportFooter?: string    // text at the bottom of PDF reports
 * }
 * ```
 *
 * Phase 7b ships configuration APIs only. The actual PDF generation consumer
 * (`server/src/modules/assessment/pdf.service.ts`) is a follow-up — reading
 * `settings.branding` there is a small one-liner when needed.
 *
 * The GET endpoint is ungated (any org member can read their org's branding —
 * it would be visible in the UI shell anyway). The PATCH endpoint requires
 * both `branding` feature and `org_admin` role.
 */

export interface BrandingSettings {
  logoUrl?: string;
  themeColor?: string;
  reportHeader?: string;
  reportFooter?: string;
}

export async function brandingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** Read current branding (any member). Returns an empty object if none set. */
  app.get('/branding', async (request) => {
    const orgId = request.org!.orgId;
    const [org] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);
    const settings = (org.settings as any) ?? {};
    const branding: BrandingSettings = settings.branding ?? {};
    return branding;
  });

  /**
   * Update branding. Gated by:
   *   - requireFeature('branding') — tier must include branding
   *   - requireRole('org_admin')    — only admins can change org-wide settings
   */
  app.patch('/branding', {
    preHandler: [requireFeature('branding'), requireRole('org_admin')],
  }, async (request) => {
    const orgId = request.org!.orgId;
    const body = request.body as Partial<BrandingSettings>;

    // Minimal validation — keep unknown fields out
    const clean: BrandingSettings = {};
    if (body.logoUrl !== undefined) {
      if (typeof body.logoUrl !== 'string') {
        throw new ValidationError('logoUrl must be a string');
      }
      clean.logoUrl = body.logoUrl;
    }
    if (body.themeColor !== undefined) {
      if (typeof body.themeColor !== 'string') {
        throw new ValidationError('themeColor must be a string');
      }
      clean.themeColor = body.themeColor;
    }
    if (body.reportHeader !== undefined) {
      if (typeof body.reportHeader !== 'string') {
        throw new ValidationError('reportHeader must be a string');
      }
      clean.reportHeader = body.reportHeader;
    }
    if (body.reportFooter !== undefined) {
      if (typeof body.reportFooter !== 'string') {
        throw new ValidationError('reportFooter must be a string');
      }
      clean.reportFooter = body.reportFooter;
    }

    // Read the current settings, merge the branding sub-object, write back.
    // Doing this as a JSONB merge on the server keeps non-branding settings intact.
    const [current] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!current) throw new NotFoundError('Organization', orgId);

    const prevSettings = (current.settings as any) ?? {};
    const prevBranding: BrandingSettings = prevSettings.branding ?? {};
    const nextBranding: BrandingSettings = { ...prevBranding, ...clean };
    const nextSettings = { ...prevSettings, branding: nextBranding };

    await db
      .update(organizations)
      .set({ settings: nextSettings, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));

    return nextBranding;
  });
}

/**
 * Admin tenant management routes.
 *
 * GET    /api/admin/tenants              — List all tenants with license info
 * GET    /api/admin/tenants/:orgId       — Tenant detail with members + license
 * POST   /api/admin/tenants              — Create tenant (wizard endpoint)
 * POST   /api/admin/tenants/:orgId/members     — Add member to org
 * PATCH  /api/admin/tenants/:orgId/members/:id — Change member role/status
 * DELETE /api/admin/tenants/:orgId/members/:id — Remove member from org
 */
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, and, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { organizations, orgMembers, users, eapPartnerships } from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { requireSystemAdmin } from '../../middleware/system-admin.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';
import { verifyLicense } from '../../lib/license/verify.js';
import { signLicense } from '../../lib/license/sign.js';
import { DEFAULT_TRIAGE_CONFIG, hasFeature, planToTier } from '@psynote/shared';

const VALID_TIERS = ['starter', 'growth', 'flagship'] as const;
const VALID_ROLES = ['org_admin', 'counselor', 'client'] as const;

export async function adminTenantRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', requireSystemAdmin);

  // ─── List Tenants ───────────────────────────────────────────────
  app.get('/', async () => {
    const orgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        licenseKey: organizations.licenseKey,
        settings: organizations.settings,
        createdAt: organizations.createdAt,
        memberCount: count(orgMembers.id),
      })
      .from(organizations)
      .leftJoin(orgMembers, eq(orgMembers.orgId, organizations.id))
      .groupBy(organizations.id)
      .orderBy(organizations.createdAt);

    const result = await Promise.all(
      orgs.map(async (org) => {
        const licenseResult = org.licenseKey
          ? await verifyLicense(org.licenseKey, org.id)
          : { valid: false, status: 'none' as const, payload: null };

        // Check org type from settings (set during wizard creation)
        const settings = (org.settings as Record<string, any>) || {};
        const orgType = settings.orgType || 'counseling';
        const isEnterprise = orgType === 'enterprise';
        let partnershipCount = 0;
        if (isEnterprise) {
          const partnerships = await db
            .select({ id: eapPartnerships.id })
            .from(eapPartnerships)
            .where(eq(eapPartnerships.enterpriseOrgId, org.id));
          partnershipCount = partnerships.length;
        }

        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          plan: org.plan,
          settings: org.settings,
          createdAt: org.createdAt,
          memberCount: Number(org.memberCount),
          orgType,
          isEnterprise,
          partnershipCount,
          license: {
            status: licenseResult.status,
            tier: licenseResult.payload?.tier ?? null,
            maxSeats: licenseResult.payload?.maxSeats ?? null,
            expiresAt: licenseResult.payload?.expiresAt ?? null,
          },
        };
      }),
    );

    return result;
  });

  // ─── Tenant Detail ──────────────────────────────────────────────
  app.get('/:orgId', async (request) => {
    const { orgId } = request.params as { orgId: string };
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);

    const members = await db
      .select({
        id: orgMembers.id,
        userId: orgMembers.userId,
        role: orgMembers.role,
        status: orgMembers.status,
        createdAt: orgMembers.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(orgMembers.orgId, orgId));

    const licenseResult = org.licenseKey
      ? await verifyLicense(org.licenseKey, org.id)
      : { valid: false, status: 'none' as const, payload: null };

    return {
      ...org,
      members,
      license: {
        status: licenseResult.status,
        tier: licenseResult.payload?.tier ?? null,
        maxSeats: licenseResult.payload?.maxSeats ?? null,
        expiresAt: licenseResult.payload?.expiresAt ?? null,
        issuedAt: licenseResult.payload?.issuedAt ?? null,
      },
    };
  });

  // ─── Create Tenant (Wizard) ─────────────────────────────────────
  app.post('/', async (request, reply) => {
    const body = request.body as {
      org: { name: string; slug: string };
      subscription: { tier: string; maxSeats: number; months: number };
      admin: { userId?: string; email?: string; name?: string; password?: string };
      settings?: Record<string, unknown>;
      providerOrgId?: string; // EAP: optional binding to a counseling org
    };

    // Validate org
    if (!body.org?.name?.trim() || !body.org?.slug?.trim()) {
      throw new ValidationError('机构名称和标识不能为空');
    }
    if (!/^[a-z0-9-]+$/.test(body.org.slug)) {
      throw new ValidationError('标识只能包含小写字母、数字和连字符');
    }

    // Check slug uniqueness
    const [existing] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, body.org.slug))
      .limit(1);
    if (existing) throw new ValidationError(`标识 '${body.org.slug}' 已存在`);

    // Validate subscription
    const { tier, maxSeats, months } = body.subscription;
    if (!tier || !VALID_TIERS.includes(tier as any)) {
      throw new ValidationError(`套餐等级无效，可选: ${VALID_TIERS.join(', ')}`);
    }
    if (!maxSeats || maxSeats < 1) throw new ValidationError('席位数必须大于 0');
    if (!months || months < 1 || months > 120) throw new ValidationError('有效期必须为 1-120 个月');

    // Map tier to plan for backwards compat
    const planMap: Record<string, string> = { solo: 'free', team: 'pro', enterprise: 'enterprise', platform: 'platform' };
    const plan = planMap[tier] || 'free';

    // 1. Create organization
    const [org] = await db.insert(organizations).values({
      name: body.org.name.trim(),
      slug: body.org.slug.trim(),
      plan,
      settings: body.settings || {},
      triageConfig: DEFAULT_TRIAGE_CONFIG,
    }).returning();

    // 2. Sign and attach license
    try {
      const licenseResult = await signLicense({
        orgId: org.id,
        tier: tier as any,
        maxSeats,
        months,
      });
      await db
        .update(organizations)
        .set({ licenseKey: licenseResult.token })
        .where(eq(organizations.id, org.id));
    } catch (err) {
      // License signing may fail if keys not configured — org still created
      console.warn('License signing failed:', err);
    }

    // 3. Create or link admin user
    //
    // 三种情况:
    //   (a) body.admin.userId 给了 → 链接已有 user (按 ID 直接绑)
    //   (b) 没给 userId 但邮箱已存在 → 复用已有 user, 不动密码
    //       (避免管理员通过此接口"接管"任何邮箱: 如果想给现有用户做机构 admin,
    //        他用自己原密码登录就行; 如果忘了密码走密码重置)
    //   (c) 没给 userId 也没匹配的邮箱 → 新建 user
    let adminUserId: string;

    if (body.admin.userId) {
      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, body.admin.userId))
        .limit(1);
      if (!existingUser) throw new ValidationError('指定的管理员用户不存在');
      adminUserId = existingUser.id;
    } else {
      if (!body.admin.email || !body.admin.name) {
        throw new ValidationError('创建新管理员需要邮箱和姓名');
      }
      const email = body.admin.email.trim().toLowerCase();
      const [existingByEmail] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingByEmail) {
        // 复用 — 不重置密码 (走 Reset 流程或对方自己登录)
        adminUserId = existingByEmail.id;
      } else {
        if (!body.admin.password) throw new ValidationError('新建管理员需要密码');
        if (body.admin.password.length < 6) throw new ValidationError('密码至少 6 位');
        const passwordHash = await bcrypt.hash(body.admin.password, 10);
        const [newUser] = await db.insert(users).values({
          id: crypto.randomUUID(),
          email,
          name: body.admin.name,
          passwordHash,
        }).returning();
        adminUserId = newUser.id;
      }
    }

    // 4. Add admin to org
    await db.insert(orgMembers).values({
      orgId: org.id,
      userId: adminUserId,
      role: 'org_admin',
      status: 'active',
    });

    // 5. If enterprise orgType + providerOrgId → create EAP partnership
    const createdOrgType = (body.settings as any)?.orgType;
    if (body.providerOrgId && createdOrgType === 'enterprise') {
      const [providerOrg] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, body.providerOrgId))
        .limit(1);

      if (providerOrg) {
        await db.insert(eapPartnerships).values({
          enterpriseOrgId: org.id,
          providerOrgId: body.providerOrgId,
          status: 'active',
          createdBy: request.user!.id,
        });
      }
    }

    await logAudit(request, 'tenant.created', 'organization', org.id);

    return reply.status(201).send({ orgId: org.id });
  });

  // ─── Add Member to Org ──────────────────────────────────────────
  app.post('/:orgId/members', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const body = request.body as {
      userId?: string;
      email?: string;
      name?: string;
      password?: string;
      role?: string;
    };

    // Verify org exists
    const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);

    const role = body.role && VALID_ROLES.includes(body.role as any) ? body.role : 'counselor';
    let userId: string;
    let reusedExistingUser = false;

    if (body.userId) {
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, body.userId)).limit(1);
      if (!existing) throw new ValidationError('用户不存在');
      userId = existing.id;
      reusedExistingUser = true;
    } else {
      if (!body.email || !body.name) {
        throw new ValidationError('需要邮箱和姓名');
      }
      const email = body.email.trim().toLowerCase();
      // 邮箱已存在就直接复用,不重置密码 — 否则管理员可以借此接管任意邮箱.
      // 如对方忘了密码走密码重置.
      const [existingByEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existingByEmail) {
        userId = existingByEmail.id;
        reusedExistingUser = true;
      } else {
        if (!body.password) throw new ValidationError('新建用户需要密码');
        if (body.password.length < 6) throw new ValidationError('密码至少 6 位');
        const passwordHash = await bcrypt.hash(body.password, 10);
        const [newUser] = await db.insert(users).values({
          id: crypto.randomUUID(),
          email,
          name: body.name,
          passwordHash,
        }).returning();
        userId = newUser.id;
      }
    }

    // 重复检查 — 原代码漏了 userId 条件 (只 where orgId), 任何已有成员都会
    // 命中却没用结果, 形如装饰性代码; 现改成真正按 (orgId, userId) 唯一性查.
    const [existingMember] = await db
      .select({ id: orgMembers.id, role: orgMembers.role, status: orgMembers.status })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .limit(1);

    if (existingMember) {
      throw new ValidationError(`该用户已是本机构成员 (角色: ${existingMember.role}, 状态: ${existingMember.status})`);
    }

    const [member] = await db.insert(orgMembers).values({
      orgId,
      userId,
      role,
      status: 'active',
    }).returning();

    await logAudit(request, 'member.added', 'org_members', member.id);

    return reply.status(201).send({ ...member, reusedExistingUser });
  });

  // ─── Update Member ──────────────────────────────────────────────
  app.patch('/:orgId/members/:memberId', async (request) => {
    const { orgId, memberId } = request.params as { orgId: string; memberId: string };
    const body = request.body as { role?: string; status?: string };

    const updates: Record<string, unknown> = {};
    if (body.role && VALID_ROLES.includes(body.role as any)) updates.role = body.role;
    if (body.status) updates.status = body.status;

    const [updated] = await db
      .update(orgMembers)
      .set(updates)
      .where(eq(orgMembers.id, memberId))
      .returning();

    if (!updated) throw new NotFoundError('Member', memberId);

    await logAudit(request, 'member.updated', 'org_members', memberId);

    return updated;
  });

  // ─── Remove Member ──────────────────────────────────────────────
  app.delete('/:orgId/members/:memberId', async (request) => {
    const { orgId, memberId } = request.params as { orgId: string; memberId: string };

    const deleted = await db
      .delete(orgMembers)
      .where(eq(orgMembers.id, memberId))
      .returning();

    if (deleted.length === 0) throw new NotFoundError('Member', memberId);

    await logAudit(request, 'member.removed', 'org_members', memberId);

    return { ok: true };
  });

  // ─── Update Tenant ──────────────────────────────────────────────
  app.patch('/:orgId', async (request) => {
    const { orgId } = request.params as { orgId: string };
    const body = request.body as { name?: string; slug?: string; orgType?: string };

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name?.trim()) updates.name = body.name.trim();
    if (body.slug?.trim()) {
      if (!/^[a-z0-9-]+$/.test(body.slug)) {
        throw new ValidationError('标识只能包含小写字母、数字和连字符');
      }
      if (body.slug !== org.slug) {
        const [dup] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, body.slug)).limit(1);
        if (dup) throw new ValidationError(`标识 '${body.slug}' 已存在`);
      }
      updates.slug = body.slug.trim();
    }
    // orgType lives inside the settings JSON blob (historical — predates the
    // migration that would have given it its own column). Merge, don't overwrite,
    // so other settings keys (aiConfig, emailConfig, branding, etc.) survive.
    if (body.orgType) {
      const ALLOWED_ORG_TYPES = ['solo', 'counseling', 'enterprise', 'school', 'hospital'];
      if (!ALLOWED_ORG_TYPES.includes(body.orgType)) {
        throw new ValidationError(`orgType 必须是 ${ALLOWED_ORG_TYPES.join(' / ')} 之一`);
      }
      const currentSettings = (org.settings || {}) as Record<string, any>;
      updates.settings = { ...currentSettings, orgType: body.orgType };
    }

    const [updated] = await db.update(organizations).set(updates).where(eq(organizations.id, orgId)).returning();
    await logAudit(request, 'tenant.updated', 'organization', orgId);
    return updated;
  });

  // ─── Delete Tenant ──────────────────────────────────────────────
  app.delete('/:orgId', async (request) => {
    const { orgId } = request.params as { orgId: string };

    const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);

    // Delete org members first, then org (cascade may not cover all FKs)
    await db.delete(orgMembers).where(eq(orgMembers.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));

    await logAudit(request, 'tenant.deleted', 'organization', orgId);
    return { ok: true };
  });

  // ─── Per-tenant Service Config ──────────────────────────────────

  /** Get service config (AI + email) with sensitive fields masked */
  app.get('/:orgId/services', async (request) => {
    const { orgId } = request.params as { orgId: string };
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);

    const settings = (org.settings || {}) as Record<string, any>;
    const aiConfig = settings.aiConfig || {};
    const emailConfig = settings.emailConfig || {};

    // Mask sensitive fields
    return {
      aiConfig: {
        apiKey: aiConfig.apiKey ? `****${aiConfig.apiKey.slice(-4)}` : '',
        baseUrl: aiConfig.baseUrl || '',
        model: aiConfig.model || '',
        monthlyTokenLimit: aiConfig.monthlyTokenLimit || 0,
      },
      emailConfig: {
        smtpHost: emailConfig.smtpHost || '',
        smtpPort: emailConfig.smtpPort || 465,
        smtpUser: emailConfig.smtpUser || '',
        smtpPass: emailConfig.smtpPass ? '****' : '',
        senderName: emailConfig.senderName || '',
        senderEmail: emailConfig.senderEmail || '',
      },
    };
  });

  /** Update service config */
  app.patch('/:orgId/services', async (request) => {
    const { orgId } = request.params as { orgId: string };
    const body = request.body as { aiConfig?: Record<string, unknown>; emailConfig?: Record<string, unknown> };

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw new NotFoundError('Organization', orgId);

    const currentSettings = (org.settings || {}) as Record<string, any>;

    if (body.aiConfig) {
      // Don't overwrite apiKey if masked value is sent back
      const existing = currentSettings.aiConfig || {};
      if (body.aiConfig.apiKey && String(body.aiConfig.apiKey).startsWith('****')) {
        body.aiConfig.apiKey = existing.apiKey;
      }
      currentSettings.aiConfig = { ...existing, ...body.aiConfig };
    }

    if (body.emailConfig) {
      const existing = currentSettings.emailConfig || {};
      if (body.emailConfig.smtpPass === '****') {
        body.emailConfig.smtpPass = existing.smtpPass;
      }
      currentSettings.emailConfig = { ...existing, ...body.emailConfig };
    }

    await db
      .update(organizations)
      .set({ settings: currentSettings, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));

    await logAudit(request, 'tenant.services.updated', 'organization', orgId);
    return { ok: true };
  });
}

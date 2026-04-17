/**
 * EAP Employee & Department management routes
 *
 * Mounted at /api/orgs/:orgId/eap/employees
 * Requires: authGuard + orgContextGuard + requireFeature('eap')
 *
 * GET    /                   — List employees (paginated, filterable by department)
 * GET    /stats              — Employee stats (headcount, registration rate, department breakdown)
 * POST   /import             — Bulk import employees from CSV
 * GET    /departments        — List departments from org settings
 * PUT    /departments        — Update department list in org settings
 */
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, and, sql, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import {
  eapEmployeeProfiles,
  organizations,
  orgMembers,
  users,
} from '../../db/schema.js';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireOrgType } from '../../middleware/feature-flag.js';
import { requireRole } from '../../middleware/rbac.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';

export async function eapEmployeeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);
  app.addHook('preHandler', requireOrgType('enterprise'));
  app.addHook('preHandler', requireRole('org_admin'));

  // ─── List Employees ──────────────────────────────────────────────
  app.get('/', async (request) => {
    const orgId = request.org!.orgId;
    const query = request.query as { department?: string; search?: string; page?: string; limit?: string };

    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '50'), 100);
    const offset = (page - 1) * limit;

    // Base query with joins
    let conditions = [eq(eapEmployeeProfiles.orgId, orgId)];

    const employees = await db
      .select({
        id: eapEmployeeProfiles.id,
        userId: eapEmployeeProfiles.userId,
        employeeId: eapEmployeeProfiles.employeeId,
        department: eapEmployeeProfiles.department,
        entryMethod: eapEmployeeProfiles.entryMethod,
        isAnonymous: eapEmployeeProfiles.isAnonymous,
        registeredAt: eapEmployeeProfiles.registeredAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(eapEmployeeProfiles)
      .leftJoin(users, eq(users.id, eapEmployeeProfiles.userId))
      .where(and(...conditions))
      .orderBy(eapEmployeeProfiles.registeredAt)
      .limit(limit)
      .offset(offset);

    // Filter in application layer (simpler than building dynamic SQL)
    let filtered = employees;
    if (query.department) {
      filtered = filtered.filter((e) => e.department === query.department);
    }
    if (query.search) {
      const q = query.search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.userName?.toLowerCase().includes(q) ||
          e.userEmail?.toLowerCase().includes(q) ||
          e.employeeId?.toLowerCase().includes(q),
      );
    }

    // Total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(eapEmployeeProfiles)
      .where(eq(eapEmployeeProfiles.orgId, orgId));

    return {
      employees: filtered.map((e) => ({
        ...e,
        // Mask anonymous employee names for HR view
        userName: e.isAnonymous ? `匿名员工` : e.userName,
        userEmail: e.isAnonymous ? null : e.userEmail,
      })),
      pagination: { page, limit, total: Number(total) },
    };
  });

  // ─── Employee Stats ──────────────────────────────────────────────
  app.get('/stats', async (request) => {
    const orgId = request.org!.orgId;

    // Total employees
    const [{ total }] = await db
      .select({ total: count() })
      .from(eapEmployeeProfiles)
      .where(eq(eapEmployeeProfiles.orgId, orgId));

    // By department
    const deptStats = await db
      .select({
        department: eapEmployeeProfiles.department,
        count: count(),
      })
      .from(eapEmployeeProfiles)
      .where(eq(eapEmployeeProfiles.orgId, orgId))
      .groupBy(eapEmployeeProfiles.department);

    // Anonymous count
    const [{ anonymousCount }] = await db
      .select({ anonymousCount: count() })
      .from(eapEmployeeProfiles)
      .where(and(
        eq(eapEmployeeProfiles.orgId, orgId),
        eq(eapEmployeeProfiles.isAnonymous, true),
      ));

    return {
      total: Number(total),
      anonymousCount: Number(anonymousCount),
      departments: deptStats.map((d) => ({
        name: d.department || '未分配',
        count: Number(d.count),
      })),
    };
  });

  // ─── Bulk Import Employees (CSV) ─────────────────────────────────
  app.post('/import', async (request, reply) => {
    const orgId = request.org!.orgId;
    const body = request.body as {
      employees: Array<{
        name: string;
        email: string;
        employeeId?: string;
        department?: string;
      }>;
    };

    if (!body.employees || !Array.isArray(body.employees) || body.employees.length === 0) {
      throw new ValidationError('employees array is required and must not be empty');
    }

    if (body.employees.length > 500) {
      throw new ValidationError('Maximum 500 employees per import');
    }

    const results: { email: string; status: 'created' | 'existing' | 'error'; error?: string }[] = [];
    const defaultPassword = 'psynote123'; // Temporary password, user should change on first login
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    for (const emp of body.employees) {
      try {
        if (!emp.name?.trim() || !emp.email?.trim()) {
          results.push({ email: emp.email || '', status: 'error', error: '姓名和邮箱不能为空' });
          continue;
        }

        // Check if user already exists
        let [existingUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, emp.email.trim().toLowerCase()))
          .limit(1);

        let userId: string;

        if (existingUser) {
          userId = existingUser.id;
        } else {
          // Create new user
          const [newUser] = await db.insert(users).values({
            id: crypto.randomUUID(),
            email: emp.email.trim().toLowerCase(),
            name: emp.name.trim(),
            passwordHash,
          }).returning();
          userId = newUser.id;
        }

        // Check if already a member of this org
        const [existingMember] = await db
          .select({ id: orgMembers.id })
          .from(orgMembers)
          .where(and(
            eq(orgMembers.orgId, orgId),
            eq(orgMembers.userId, userId),
          ))
          .limit(1);

        if (!existingMember) {
          // Add as client member
          await db.insert(orgMembers).values({
            id: crypto.randomUUID(),
            orgId,
            userId,
            role: 'client',
            status: 'active',
          });
        }

        // Check if employee profile already exists
        const [existingProfile] = await db
          .select({ id: eapEmployeeProfiles.id })
          .from(eapEmployeeProfiles)
          .where(and(
            eq(eapEmployeeProfiles.orgId, orgId),
            eq(eapEmployeeProfiles.userId, userId),
          ))
          .limit(1);

        if (existingProfile) {
          // Update department/employeeId if provided
          await db
            .update(eapEmployeeProfiles)
            .set({
              department: emp.department || existingProfile.id, // keep existing if not provided
              employeeId: emp.employeeId || null,
            })
            .where(eq(eapEmployeeProfiles.id, existingProfile.id));
          results.push({ email: emp.email, status: 'existing' });
        } else {
          // Create employee profile
          await db.insert(eapEmployeeProfiles).values({
            orgId,
            userId,
            employeeId: emp.employeeId || null,
            department: emp.department || null,
            entryMethod: 'hr_import',
            isAnonymous: false,
          });
          results.push({ email: emp.email, status: 'created' });
        }
      } catch (err: any) {
        results.push({ email: emp.email || '', status: 'error', error: err.message });
      }
    }

    const created = results.filter((r) => r.status === 'created').length;
    const existing = results.filter((r) => r.status === 'existing').length;
    const errors = results.filter((r) => r.status === 'error').length;

    return {
      summary: { total: results.length, created, existing, errors },
      results,
    };
  });

  // ─── Get Departments ─────────────────────────────────────────────
  app.get('/departments', async (request) => {
    const orgId = request.org!.orgId;

    const [org] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    const settings = (org?.settings || {}) as Record<string, any>;
    const eapConfig = settings.eapConfig || {};

    return {
      departments: eapConfig.departments || [],
      crisisContacts: eapConfig.crisisContacts || [],
    };
  });

  // ─── Update Departments ──────────────────────────────────────────
  app.put('/departments', async (request) => {
    const orgId = request.org!.orgId;
    const body = request.body as {
      departments?: Array<{ id: string; name: string; headCount?: number }>;
      crisisContacts?: Array<{ userId: string; name: string; phone?: string }>;
    };

    // Load current settings
    const [org] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) throw new NotFoundError('Organization not found');

    const settings = { ...(org.settings as Record<string, any> || {}) };
    const eapConfig = { ...(settings.eapConfig || {}) };

    if (body.departments !== undefined) {
      eapConfig.departments = body.departments;
    }
    if (body.crisisContacts !== undefined) {
      eapConfig.crisisContacts = body.crisisContacts;
    }

    settings.eapConfig = eapConfig;

    await db
      .update(organizations)
      .set({ settings, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));

    return { eapConfig };
  });
}

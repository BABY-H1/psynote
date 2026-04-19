/**
 * Central role → credentials mapping for E2E smoke tests.
 *
 * ## Bootstrapping from scratch
 *
 * All 8 accounts are created by `npm run test:e2e:seed` (runs
 * `server/src/seed-e2e.ts`). This is idempotent — re-running is safe and
 * always upserts the password_hash to `admin123`.
 *
 * Typical workflow:
 *   1. Ensure DB schema is up-to-date:   `cd server && npm run db:migrate`
 *   2. Seed fixtures:                     `npm run test:e2e:seed`
 *   3. Start dev server in another tab:   `npm run dev`
 *   4. Run smoke:                         `npm run test:e2e`
 *
 * ## Account provenance
 *
 * Each account has a `source` tag documenting how it was seeded:
 *   - 'seed-e2e': Created by `server/src/seed-e2e.ts` — fully reproducible, CI-safe.
 */

export type RoleKey =
  | 'sysadmin'
  | 'counselingOrgAdmin'
  | 'counselingCounselor'
  | 'enterpriseOrgAdmin'
  | 'schoolOrgAdmin'
  | 'soloOrgAdmin'
  | 'clientPortal';

export interface Account {
  email: string;
  password: string;
  /** Which seeder creates this account. See `npm run test:e2e:seed`. */
  source: 'seed-e2e';
  /** Brief note about where in the app this role should land after login. */
  expectedLandingHint: string;
  /** Absolute path (relative to repo root) where storageState will be persisted. */
  storageStatePath: string;
}

export const accounts: Record<RoleKey, Account> = {
  sysadmin: {
    email: 'sysadmin@psynote.cn',
    password: 'admin123',
    source: 'seed-e2e',
    expectedLandingHint: '/admin (no org selected) or / with admin sidebar',
    storageStatePath: 'e2e/.auth/sysadmin.json',
  },

  counselingOrgAdmin: {
    email: 'admin@demo.psynote.cn',
    password: 'admin123',
    source: 'seed-e2e',
    expectedLandingHint: '/ → OrgAdminDashboard',
    storageStatePath: 'e2e/.auth/counseling-org-admin.json',
  },

  counselingCounselor: {
    email: 'counselor@demo.psynote.cn',
    password: 'admin123',
    source: 'seed-e2e',
    expectedLandingHint: '/ → DashboardHome',
    storageStatePath: 'e2e/.auth/counseling-counselor.json',
  },

  enterpriseOrgAdmin: {
    email: 'hr@sinopec-eap.com',
    password: 'admin123',
    source: 'seed-e2e',
    expectedLandingHint: '/ → EnterpriseDashboard',
    storageStatePath: 'e2e/.auth/enterprise-org-admin.json',
  },

  schoolOrgAdmin: {
    email: 'ybzx@psynote.cn',
    password: 'admin123',
    source: 'seed-e2e',
    expectedLandingHint: '/ → SchoolDashboard',
    storageStatePath: 'e2e/.auth/school-org-admin.json',
  },

  soloOrgAdmin: {
    email: 'solo@demo.psynote.cn',
    password: 'admin123',
    source: 'seed-e2e',
    expectedLandingHint: '/ → DashboardHome (solo branch)',
    storageStatePath: 'e2e/.auth/solo-org-admin.json',
  },

  clientPortal: {
    email: 'client@demo.psynote.cn',
    password: 'admin123',
    source: 'seed-e2e',
    expectedLandingHint: '/portal',
    storageStatePath: 'e2e/.auth/client-portal.json',
  },
};

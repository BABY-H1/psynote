import { test as setup, expect, request } from '@playwright/test';
import { accounts, type RoleKey } from './fixtures/accounts';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * Login setup — runs once before the smoke project.
 *
 * Strategy: API-based login (NOT UI-based). We POST to /api/auth/login
 * directly, then hydrate the Zustand persist slot in localStorage with the
 * resulting token + user + org info. Then a single `page.reload()` lets the
 * app boot with that state.
 *
 * Why not UI login?
 *   - Rate limiter trips after ~7 consecutive login clicks
 *   - Chromium + Vite HMR under sustained load occasionally mis-render the
 *     login page (observed: stale dashboard from a prior context surfacing
 *     despite `browser.newContext()` giving empty localStorage)
 *   - API login is deterministic, fast (<1s per role), and idempotent
 *
 * Trade-off: we no longer exercise the login form itself. That's OK — the
 * login UI is a tiny surface and would be covered by a dedicated login-form
 * spec if we wanted; the 8 role smoke tests are about POST-login behavior.
 */

// Ensure the .auth directory exists
mkdirSync(path.join(process.cwd(), 'e2e', '.auth'), { recursive: true });

const API_BASE = 'http://localhost:4000';
const CLIENT_BASE = 'http://localhost:5173';

const roleKeys = Object.keys(accounts) as RoleKey[];

interface LoginResp {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; isSystemAdmin?: boolean };
}

interface OrgResp {
  id: string;
  myRole: string;
  plan?: string;
  settings?: { orgType?: string };
}

// Build the exact state shape that Zustand's persist middleware writes for
// `psynote-auth`. Must match client/src/stores/authStore.ts partialize.
function buildPersistedAuth(args: {
  user: LoginResp['user'];
  accessToken: string;
  refreshToken: string;
  isSystemAdmin: boolean;
  org?: OrgResp & { tier: string };
}) {
  return JSON.stringify({
    state: {
      user: {
        id: args.user.id,
        email: args.user.email,
        name: args.user.name,
        createdAt: '',
      },
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      currentOrgId: args.org?.id ?? null,
      currentRole: args.org?.myRole ?? null,
      currentOrgTier: args.org?.tier ?? null,
      currentOrgType: args.org?.settings?.orgType ?? null,
      licenseInfo: null,
      isSystemAdmin: args.isSystemAdmin,
    },
    // Must match authStore.ts persist { version }. Bumped to 2 when currentOrgType
    // became part of the contract (prior to v2, stale persisted state with a
    // set currentOrgId but no currentOrgType would be migrated back to /select-org).
    version: 2,
  });
}

// Map org.plan → tier (mirrors packages/shared/src/types/tier.ts planToTier)
function planToTier(plan: string | null | undefined): string {
  switch (plan) {
    case 'free':      return 'starter';
    case 'pro':       return 'growth';
    case 'enterprise': return 'growth';    // legacy
    case 'premium':   return 'flagship';
    case 'platform':  return 'flagship';   // legacy
    default:          return 'starter';
  }
}

for (const key of roleKeys) {
  const acct = accounts[key];

  setup(`authenticate ${key} (${acct.email})`, async ({ browser }) => {
    // --- 1. API login ---
    const apiReq = await request.newContext({ baseURL: API_BASE });
    const loginRes = await apiReq.post('/api/auth/login', {
      data: { email: acct.email, password: acct.password },
    });
    expect(loginRes.ok(), `login failed for ${acct.email}`).toBeTruthy();
    const login: LoginResp = await loginRes.json();

    // --- 2. Fetch orgs (unless system admin — goes straight to /admin) ---
    let firstOrg: (OrgResp & { tier: string }) | undefined;
    const isSystemAdmin = login.user.isSystemAdmin ?? false;
    if (!isSystemAdmin) {
      const orgsRes = await apiReq.get('/api/orgs', {
        headers: { Authorization: `Bearer ${login.accessToken}` },
      });
      if (orgsRes.ok()) {
        const orgs = (await orgsRes.json()) as OrgResp[];
        if (orgs.length > 0) {
          firstOrg = { ...orgs[0], tier: planToTier(orgs[0].plan) };
        }
      }
    }
    await apiReq.dispose();

    // --- 3. Hydrate localStorage in a fresh browser context ---
    const context = await browser.newContext();
    const page = await context.newPage();

    const persistedAuth = buildPersistedAuth({
      user: login.user,
      accessToken: login.accessToken,
      refreshToken: login.refreshToken,
      isSystemAdmin,
      org: firstOrg,
    });

    // Inject BEFORE the first navigation so the app sees it on first render.
    await context.addInitScript((authJson: string) => {
      localStorage.setItem('psynote-auth', authJson);
    }, persistedAuth);

    // --- 4. Navigate to the role's expected landing page & verify not /login ---
    const landingPath = isSystemAdmin
      ? '/admin'
      : firstOrg?.myRole === 'client'
        ? '/portal'
        : '/';

    await page.goto(CLIENT_BASE + landingPath, { waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // --- 5. Persist the full storage state ---
    await context.storageState({ path: acct.storageStatePath });
    await context.close();
  });
}

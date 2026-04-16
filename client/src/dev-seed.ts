/**
 * Dev-only: seed authStore with a demo user so the UI is viewable
 * without manually logging in. Import this in main.tsx only in dev mode.
 *
 * Behavior:
 *   1. Waits for zustand persist rehydration to complete (otherwise
 *      a rehydrate-after-seed race can wipe the seeded state).
 *   2. If already authenticated with a real JWT, no-ops.
 *   3. Tries a real POST /api/auth/login + GET /api/orgs to get a valid
 *      backend-issued token and org membership. Requires backend on
 *      http://localhost:4000 via the Vite /api proxy.
 *   4. If the backend is unreachable, falls back to hard-coded demo user +
 *      fake token, so the UI is still viewable for pure frontend previews
 *      (authed API calls will 401 in that mode).
 */
import { useAuthStore } from './stores/authStore';

const DEMO_USERS = {
  counselor: {
    user: {
      id: 'bef00ee4-8365-d97a-43e6-5524af5f19b4',
      email: 'counselor@demo.psynote.cn',
      name: '张咨询师',
      avatarUrl: undefined,
      createdAt: new Date().toISOString(),
    },
    role: 'counselor' as const,
    orgId: '3241cbd8-5582-24f1-d9dd-ebbba95cb673',
  },
  client: {
    user: {
      id: 'e2a3b71f-366f-0b18-40fa-9c8d44dd9dee',
      email: 'client@demo.psynote.cn',
      name: '李同学',
      avatarUrl: undefined,
      createdAt: new Date().toISOString(),
    },
    role: 'client' as const,
    orgId: '3241cbd8-5582-24f1-d9dd-ebbba95cb673',
  },
  org_admin: {
    user: {
      id: 'a1fe808c-72da-8b81-242c-ea6c076d8205',
      email: 'admin@demo.psynote.cn',
      name: '王管理员',
      avatarUrl: undefined,
      createdAt: new Date().toISOString(),
    },
    role: 'org_admin' as const,
    orgId: '3241cbd8-5582-24f1-d9dd-ebbba95cb673',
  },
};

const FAKE_TOKEN = 'demo-token-not-real';

/** Wait until zustand persist finishes loading from localStorage. */
function waitForHydration(): Promise<void> {
  return new Promise((resolve) => {
    if (useAuthStore.getState()._hydrated) {
      resolve();
      return;
    }
    const unsub = useAuthStore.subscribe((state) => {
      if (state._hydrated) {
        unsub();
        resolve();
      }
    });
  });
}

function isRealJwt(token: string | null): boolean {
  return !!token && token !== FAKE_TOKEN && token.startsWith('eyJ');
}

export async function seedDemoAuth(role: 'counselor' | 'client' | 'org_admin' = 'counselor') {
  await waitForHydration();

  const state = useAuthStore.getState();
  // Already authenticated with a real JWT — don't clobber it.
  if (state.user && isRealJwt(state.accessToken)) return;

  const demo = DEMO_USERS[role];

  // Try real login against the backend (via Vite dev proxy).
  try {
    const loginRes = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Password is set by migration 006-self-auth.ts (demo123 for all seed users)
      body: JSON.stringify({ email: demo.user.email, password: 'demo123' }),
    });

    if (loginRes.ok) {
      const { user, accessToken, refreshToken, isSystemAdmin } = await loginRes.json();

      const orgsRes = await fetch('/api/orgs', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const orgs = orgsRes.ok ? await orgsRes.json() : [];
      const org = orgs.find((o: { id: string }) => o.id === demo.orgId) ?? orgs[0];

      // org.plan is the raw DB column ('free' | 'pro' | 'enterprise'); the auth
      // store expects an OrgTier ('solo' | 'team' | 'enterprise' | 'platform').
      // Mirror LoginPage.tsx and App.tsx which both use planToTier here.
      const { planToTier } = await import('@psynote/shared');

      const store = useAuthStore.getState();
      store.setAuth(user, accessToken, refreshToken, !!isSystemAdmin);
      if (org) {
        const orgType = org.settings?.orgType || 'counseling';
        store.setOrg(org.id, org.myRole ?? demo.role, planToTier(org.plan), undefined, orgType);
      } else {
        store.setOrg(demo.orgId, demo.role, planToTier(null));
      }
      return;
    }
    // Non-OK: fall through to fake token so the UI still renders.
    // eslint-disable-next-line no-console
    console.warn('[dev-seed] backend login failed, falling back to fake token', await loginRes.text());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[dev-seed] backend unreachable, falling back to fake token', err);
  }

  // Fallback: fake token (UI renders but authed API calls will 401).
  const store = useAuthStore.getState();
  store.setAuth(demo.user, FAKE_TOKEN, FAKE_TOKEN);
  store.setOrg(demo.orgId, demo.role);
}

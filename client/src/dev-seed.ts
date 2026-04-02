/**
 * Dev-only: seed authStore with a demo user so the UI is viewable
 * without a running backend. Import this in main.tsx only in dev mode.
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

export function seedDemoAuth(role: 'counselor' | 'client' | 'org_admin' = 'counselor') {
  const store = useAuthStore.getState();
  // Only seed if no user is already logged in
  if (store.user) return;

  const demo = DEMO_USERS[role];
  store.setAuth(demo.user, 'demo-token-not-real', 'demo-refresh-not-real');
  store.setOrg(demo.orgId, demo.role);
}

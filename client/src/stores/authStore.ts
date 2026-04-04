import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, OrgRole } from '@psynote/shared';
import { api } from '../api/client';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  currentOrgId: string | null;
  currentRole: OrgRole | null;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setOrg: (orgId: string, role: OrgRole) => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      currentOrgId: null,
      currentRole: null,

      setAuth: (user, accessToken, refreshToken) => {
        api.setToken(accessToken);
        set({ user, accessToken, refreshToken });
      },

      setOrg: (orgId, role) => {
        set({ currentOrgId: orgId, currentRole: role });
      },

      updateTokens: (accessToken, refreshToken) => {
        api.setToken(accessToken);
        set({ accessToken, refreshToken });
      },

      logout: () => {
        api.setToken(null);
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          currentOrgId: null,
          currentRole: null,
        });
      },
    }),
    {
      name: 'psynote-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        currentOrgId: state.currentOrgId,
        currentRole: state.currentRole,
      }),
    },
  ),
);

// Restore token on app load
const stored = useAuthStore.getState();
if (stored.accessToken) {
  api.setToken(stored.accessToken);
}

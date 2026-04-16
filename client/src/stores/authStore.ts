import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, OrgRole, OrgTier, OrgType, LicenseInfo } from '@psynote/shared';
import { api } from '../api/client';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  currentOrgId: string | null;
  currentRole: OrgRole | null;
  /** SaaS tier of the current org (starter|growth|flagship) */
  currentOrgTier: OrgTier | null;
  /** Organization type (solo|counseling|enterprise|school|hospital) */
  currentOrgType: OrgType | null;
  /** License info for the current org */
  licenseInfo: LicenseInfo | null;
  isSystemAdmin: boolean;
  _hydrated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string, isSystemAdmin?: boolean) => void;
  setOrg: (orgId: string, role: OrgRole, tier?: OrgTier, license?: LicenseInfo, orgType?: OrgType) => void;
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
      currentOrgTier: null,
      currentOrgType: null,
      licenseInfo: null,
      isSystemAdmin: false,
      _hydrated: false,

      setAuth: (user, accessToken, refreshToken, isSystemAdmin = false) => {
        api.setToken(accessToken);
        // Clear org/role/tier so OrgSelector re-fetches for the new user
        set({
          user,
          accessToken,
          refreshToken,
          currentOrgId: null,
          currentRole: null,
          currentOrgTier: null,
          currentOrgType: null,
          licenseInfo: null,
          isSystemAdmin,
        });
      },

      setOrg: (orgId, role, tier, license, orgType) => {
        set({
          currentOrgId: orgId,
          currentRole: role,
          currentOrgTier: tier ?? null,
          currentOrgType: (orgType as OrgType) ?? null,
          licenseInfo: license ?? null,
        });
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
          currentOrgTier: null,
          currentOrgType: null,
          licenseInfo: null,
          isSystemAdmin: false,
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
        currentOrgTier: state.currentOrgTier,
        currentOrgType: state.currentOrgType,
        licenseInfo: state.licenseInfo,
        isSystemAdmin: state.isSystemAdmin,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hydrated = true;
          if (state.accessToken) {
            api.setToken(state.accessToken);
          }
        }
      },
    },
  ),
);


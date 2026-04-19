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
  /**
   * Switch to an org. All five org-scope fields are REQUIRED — the compiler
   * enforces that callers always supply a complete org context. For partial
   * updates to the CURRENT org (e.g. license activation swapping tier), use
   * `updateCurrentOrg` instead.
   */
  setOrg: (
    orgId: string,
    role: OrgRole,
    tier: OrgTier,
    license: LicenseInfo | null,
    orgType: OrgType,
  ) => void;
  /**
   * Patch fields on the CURRENT org without switching. Used by license
   * activation, lazy tier/orgType hydration, etc. Any field omitted from the
   * patch is preserved.
   */
  updateCurrentOrg: (patch: Partial<{
    tier: OrgTier;
    orgType: OrgType;
    license: LicenseInfo | null;
  }>) => void;
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
          currentOrgTier: tier,
          currentOrgType: orgType,
          licenseInfo: license,
        });
      },

      updateCurrentOrg: (patch) => {
        set((state) => {
          const nextTier = patch.tier !== undefined ? patch.tier : state.currentOrgTier;
          const nextType = patch.orgType !== undefined ? patch.orgType : state.currentOrgType;
          const nextLicense = patch.license !== undefined ? patch.license : state.licenseInfo;
          // Short-circuit if nothing actually changed — prevents unnecessary
          // re-renders of every AppShell / OrgSettingsPage subscriber when a
          // caller (e.g. SubscriptionTab polling) fires the same payload.
          if (
            nextTier === state.currentOrgTier
            && nextType === state.currentOrgType
            && nextLicense === state.licenseInfo
          ) {
            return state;
          }
          return {
            currentOrgTier: nextTier,
            currentOrgType: nextType,
            licenseInfo: nextLicense,
          };
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
      version: 2,
      /**
       * v1 → v2 migration: earlier schema did not have `currentOrgType`. Any
       * persisted state with an `orgId` but no `orgType` is stale — we null
       * out the org selection so the user is routed back through
       * `/select-org`, which calls `setOrg(...)` with a full 5-tuple. This
       * replaces the previous defensive `GET /orgs/:id` useEffects in
       * AppShell, which silently masked the underlying inconsistency.
       */
      migrate: (persisted: unknown, fromVersion: number) => {
        const s = (persisted ?? {}) as Partial<AuthState>;
        if (fromVersion < 2 && s.currentOrgId && !s.currentOrgType) {
          return {
            ...s,
            currentOrgId: null,
            currentRole: null,
            currentOrgTier: null,
            licenseInfo: null,
          } as AuthState;
        }
        return s as AuthState;
      },
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

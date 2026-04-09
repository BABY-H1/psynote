/**
 * Phase 7b — Organization branding React Query hooks.
 *
 * Reads and writes `/api/orgs/:orgId/branding`. The PATCH endpoint is gated
 * server-side by the `branding` feature + `org_admin` role; the client should
 * also wrap the branding UI in a `<FeatureGate feature="branding">` to avoid
 * showing a dead button for non-branding tiers.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../stores/authStore';

export interface BrandingSettings {
  logoUrl?: string;
  themeColor?: string;
  reportHeader?: string;
  reportFooter?: string;
}

function orgPrefix(orgId: string | null) {
  return `/orgs/${orgId}`;
}

export function useOrgBranding() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery<BrandingSettings>({
    queryKey: ['org-branding', orgId],
    queryFn: () => api.get<BrandingSettings>(`${orgPrefix(orgId)}/branding`),
    enabled: !!orgId,
  });
}

export function useUpdateOrgBranding() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const qc = useQueryClient();
  return useMutation<BrandingSettings, Error, Partial<BrandingSettings>>({
    mutationFn: (patch) =>
      api.patch<BrandingSettings>(`${orgPrefix(orgId)}/branding`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-branding', orgId] });
    },
  });
}

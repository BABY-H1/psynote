import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { useToast } from '../../../shared/components';
import type { OrgTier } from '@psynote/shared';

/**
 * License activation mutation — shared between `SubscriptionTab` and
 * `LicenseCard`. Owns:
 *   - `POST /orgs/:orgId/license`
 *   - `subscription` query invalidation
 *   - authStore `updateCurrentOrg` with fresh tier + license
 *   - success / error toast
 *
 * Callers wire their own local form-state reset via the `onReset` callback
 * (e.g. clearing the license input textbox + hiding the form) so the hook
 * stays UI-framework agnostic.
 */
export function useLicenseActivation(onReset?: () => void) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const updateCurrentOrg = useAuthStore((s) => s.updateCurrentOrg);
  const { toast } = useToast();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (licenseKey: string) =>
      api.post<{
        success: boolean;
        tier: string;
        label: string;
        maxSeats: number;
        expiresAt: string;
      }>(`/orgs/${orgId}/license`, { licenseKey }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['subscription'] });
      updateCurrentOrg({
        tier: data.tier as OrgTier,
        license: {
          status: 'active',
          maxSeats: data.maxSeats,
          expiresAt: data.expiresAt,
        },
      });
      onReset?.();
      toast(`许可证已激活 — ${data.label}`, 'success');
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : '许可证激活失败';
      toast(message, 'error');
    },
  });
}

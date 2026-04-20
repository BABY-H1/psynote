import { useCallback } from 'react';
import type { OrgTier } from '@psynote/shared';
import { api } from '../../../../api/client';
import type { ServiceConfig } from './types';

/**
 * All API-driven actions for TenantDetail collected into one hook, so
 * the orchestrator file stays under the 200-line target. Each handler
 * is stable (useCallback) and takes its form data + error setter
 * explicitly — this keeps the hook free of its own state, matching the
 * parent's single-source-of-truth UI state.
 */
export function useTenantActions(opts: {
  orgId: string | undefined;
  reloadTenant: () => Promise<void>;
  reloadServices: () => Promise<void>;
}) {
  const { orgId, reloadTenant, reloadServices } = opts;

  const addMember = useCallback(
    async (
      form: { email: string; name: string; password: string; role: string },
      setError: (msg: string) => void,
      onSuccess: () => void,
    ) => {
      if (!orgId) return;
      setError('');
      try {
        await api.post(`/admin/tenants/${orgId}/members`, form);
        onSuccess();
        await reloadTenant();
      } catch (err: any) { setError(err?.message || '添加失败'); }
    },
    [orgId, reloadTenant],
  );

  const removeMember = useCallback(async (memberId: string) => {
    if (!orgId || !confirm('确定移除该成员？')) return;
    try { await api.delete(`/admin/tenants/${orgId}/members/${memberId}`); await reloadTenant(); }
    catch (err) { console.error('Failed to remove member:', err); }
  }, [orgId, reloadTenant]);

  const changeMemberRole = useCallback(async (memberId: string, role: string) => {
    if (!orgId) return;
    try { await api.patch(`/admin/tenants/${orgId}/members/${memberId}`, { role }); await reloadTenant(); }
    catch (err) { console.error('Failed to change role:', err); }
  }, [orgId, reloadTenant]);

  const issueLicense = useCallback(
    async (
      form: { tier: OrgTier; maxSeats: number; months: number },
      setError: (msg: string) => void,
      onSuccess: () => void,
    ) => {
      if (!orgId) return;
      setError('');
      try {
        await api.post('/admin/licenses/issue', { orgId, ...form });
        onSuccess();
        await reloadTenant();
      } catch (err: any) { setError(err?.message || '签发失败'); }
    },
    [orgId, reloadTenant],
  );

  const renewLicense = useCallback(async () => {
    if (!orgId) return;
    try { await api.post('/admin/licenses/renew', { orgId, months: 12 }); await reloadTenant(); }
    catch (err: any) { alert(err?.message || '续期失败'); }
  }, [orgId, reloadTenant]);

  const revokeLicense = useCallback(async () => {
    if (!orgId || !confirm('确定撤销该租户的许可证？')) return;
    try { await api.post('/admin/licenses/revoke', { orgId }); await reloadTenant(); }
    catch (err: any) { alert(err?.message || '撤销失败'); }
  }, [orgId, reloadTenant]);

  const modifyLicense = useCallback(
    async (
      form: { tier: OrgTier; maxSeats: number },
      setError: (msg: string) => void,
      onSuccess: () => void,
    ) => {
      if (!orgId) return;
      setError('');
      try {
        await api.post('/admin/licenses/modify', { orgId, ...form });
        onSuccess();
        await reloadTenant();
      } catch (err: any) { setError(err?.message || '修改失败'); }
    },
    [orgId, reloadTenant],
  );

  const saveServices = useCallback(
    async (serviceConfig: ServiceConfig | null, setSaving: (s: boolean) => void, onDone: () => void) => {
      if (!orgId || !serviceConfig) return;
      setSaving(true);
      try {
        await api.patch(`/admin/tenants/${orgId}/services`, serviceConfig);
        onDone();
        await reloadServices();
      } catch (err: any) { alert(err?.message || '保存失败'); }
      finally { setSaving(false); }
    },
    [orgId, reloadServices],
  );

  return {
    addMember,
    removeMember,
    changeMemberRole,
    issueLicense,
    renewLicense,
    revokeLicense,
    modifyLicense,
    saveServices,
  };
}

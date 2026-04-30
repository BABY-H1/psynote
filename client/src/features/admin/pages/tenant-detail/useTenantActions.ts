import { useCallback } from 'react';
import type { OrgTier } from '@psynote/shared';
import { api } from '../../../../api/client';
import { useToast } from '../../../../shared/components';
import type { BasicInfoDraft, ServiceConfig } from './types';

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
  const { toast } = useToast();

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

  // Phase 1.5: 单点开通"临床执业身份" — 把 phi_full 加进/移出该成员的
  // access_profile.dataClasses。clinic_admin 默认不读 phi_full,但小诊所
  // 老板兼咨询师可以打开此开关恢复全文访问。
  const setClinicalPractitioner = useCallback(
    async (memberId: string, on: boolean) => {
      if (!orgId) return;
      try {
        await api.patch(`/admin/tenants/${orgId}/members/${memberId}`, { clinicalPractitioner: on });
        await reloadTenant();
        toast(on ? '已标记为临床执业身份(可读 phi_full)' : '已取消临床执业身份', 'success');
      } catch (err: any) {
        toast(err?.message || '操作失败', 'error');
      }
    },
    [orgId, reloadTenant, toast],
  );

  const issueLicense = useCallback(
    async (
      form: { tier: OrgTier; maxSeats: number; months: number; validFrom?: string },
      setError: (msg: string) => void,
      onSuccess: () => void,
    ) => {
      if (!orgId) return;
      setError('');
      try {
        // Server accepts `validFrom` as an ISO string — forward the YYYY-MM-DD
        // from the date input as-is; JS's new Date('YYYY-MM-DD') parses it as
        // UTC midnight, which is the right anchor for the expiry countdown.
        await api.post('/admin/licenses/issue', { orgId, ...form });
        onSuccess();
        await reloadTenant();
        toast('许可证已签发', 'success');
      } catch (err: any) { setError(err?.message || '签发失败'); }
    },
    [orgId, reloadTenant, toast],
  );

  const renewLicense = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await api.post<{ expiresAt: string }>('/admin/licenses/renew', { orgId, months: 12 });
      await reloadTenant();
      const newExpiry = res?.expiresAt ? new Date(res.expiresAt).toLocaleDateString('zh-CN') : '';
      toast(newExpiry ? `续期成功，新到期日：${newExpiry}` : '续期成功', 'success');
    } catch (err: any) { toast(err?.message || '续期失败', 'error'); }
  }, [orgId, reloadTenant, toast]);

  const revokeLicense = useCallback(async () => {
    if (!orgId || !confirm('确定撤销该租户的许可证？')) return;
    try {
      await api.post('/admin/licenses/revoke', { orgId });
      await reloadTenant();
      toast('许可证已撤销', 'success');
    } catch (err: any) { toast(err?.message || '撤销失败', 'error'); }
  }, [orgId, reloadTenant, toast]);

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
        toast('许可证已修改', 'success');
      } catch (err: any) { setError(err?.message || '修改失败'); }
    },
    [orgId, reloadTenant, toast],
  );

  /**
   * Per-card saves for the basic-info tab. Each card manages its own edit
   * state and only PATCHes the fields it owns — no cross-card
   * entanglement, and saving one card doesn't risk clobbering another's
   * pending edits.
   *
   * `saveAiConfig` and `saveEmailConfig` both hit the same
   * `/admin/tenants/:id/services` endpoint but send only their slice of
   * the payload; the server merges into `settings.{aiConfig,emailConfig}`
   * so untouched keys survive.
   */
  const saveTenantMetadata = useCallback(
    async (draft: BasicInfoDraft): Promise<void> => {
      if (!orgId) return;
      try {
        await api.patch(`/admin/tenants/${orgId}`, {
          name: draft.name,
          orgType: draft.orgType,
        });
        await reloadTenant();
      } catch (err: any) {
        alert(err?.message || '保存失败');
        throw err;
      }
    },
    [orgId, reloadTenant],
  );

  const saveAiConfig = useCallback(
    async (aiConfig: ServiceConfig['aiConfig']): Promise<void> => {
      if (!orgId) return;
      try {
        await api.patch(`/admin/tenants/${orgId}/services`, { aiConfig });
        await reloadServices();
      } catch (err: any) {
        alert(err?.message || '保存失败');
        throw err;
      }
    },
    [orgId, reloadServices],
  );

  const saveEmailConfig = useCallback(
    async (emailConfig: ServiceConfig['emailConfig']): Promise<void> => {
      if (!orgId) return;
      try {
        await api.patch(`/admin/tenants/${orgId}/services`, { emailConfig });
        await reloadServices();
      } catch (err: any) {
        alert(err?.message || '保存失败');
        throw err;
      }
    },
    [orgId, reloadServices],
  );

  return {
    addMember,
    removeMember,
    changeMemberRole,
    setClinicalPractitioner,
    issueLicense,
    renewLicense,
    revokeLicense,
    modifyLicense,
    saveTenantMetadata,
    saveAiConfig,
    saveEmailConfig,
  };
}

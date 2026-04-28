import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Users } from 'lucide-react';
import { TIER_LABELS, getOrgTypeDisplay, type OrgTier } from '@psynote/shared';
import { api } from '../../../api/client';
import {
  AddMemberModal,
  IssueLicenseModal,
  ModifyLicenseModal,
} from './tenant-detail/TenantDetailModals';
import { TenantBasicInfoTab } from './tenant-detail/TenantBasicInfoTab';
import { TenantMembersTab } from './tenant-detail/TenantMembersTab';
import { useTenantActions } from './tenant-detail/useTenantActions';
import {
  LICENSE_STATUS_LABELS,
  extractOrgType,
  type ServiceConfig,
  type Tab,
  type TenantDetailData,
} from './tenant-detail/types';

/**
 * Sysadmin-facing tenant inspector / editor. Two tabs:
 *   - 基本信息: 5 cards, each editable card owns its own edit state and
 *     PATCHes only its own slice on save. No global edit mode.
 *   - 成员: member add / remove / role change (modal-driven).
 * License lifecycle mutations (issue / modify / renew / revoke) go
 * through modals because they're non-idempotent transactions with their
 * own validation, not simple form fields.
 */
export function TenantDetail() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('basic');

  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberForm, setAddMemberForm] = useState({ email: '', name: '', password: '', role: 'counselor' });
  const [addMemberError, setAddMemberError] = useState('');

  const [showIssueLicense, setShowIssueLicense] = useState(false);
  const [licenseForm, setLicenseForm] = useState({
    tier: 'team' as OrgTier,
    maxSeats: 10,
    months: 12,
    validFrom: new Date().toISOString().slice(0, 10),
  });
  const [licenseError, setLicenseError] = useState('');

  const [showModifyLicense, setShowModifyLicense] = useState(false);
  const [modifyForm, setModifyForm] = useState({ tier: 'team' as OrgTier, maxSeats: 10 });
  const [modifyError, setModifyError] = useState('');

  const [serviceConfig, setServiceConfig] = useState<ServiceConfig | null>(null);

  const reloadTenant = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try { setTenant(await api.get<TenantDetailData>(`/admin/tenants/${orgId}`)); }
    catch (err) { console.error('Failed to load tenant:', err); }
    finally { setLoading(false); }
  }, [orgId]);

  const reloadServices = useCallback(async () => {
    if (!orgId) return;
    try { setServiceConfig(await api.get<ServiceConfig>(`/admin/tenants/${orgId}/services`)); }
    catch (err) { console.error('Failed to load services:', err); }
  }, [orgId]);

  useEffect(() => { reloadTenant(); }, [reloadTenant]);
  useEffect(() => {
    // Services config is part of the basic-info tab; fetched lazily on first visit.
    if (tab === 'basic' && !serviceConfig) reloadServices();
  }, [tab, serviceConfig, reloadServices]);

  const actions = useTenantActions({ orgId, reloadTenant, reloadServices });

  function openModifyLicense() {
    if (tenant?.license.tier) setModifyForm({ tier: tenant.license.tier, maxSeats: tenant.license.maxSeats || 10 });
    setModifyError('');
    setShowModifyLicense(true);
  }

  if (loading) return <div className="p-6 flex items-center justify-center min-h-[400px]"><p className="text-slate-400">加载中...</p></div>;
  if (!tenant) return <div className="p-6"><div className="bg-red-50 text-red-600 rounded-lg p-4 text-sm">租户不存在或加载失败</div></div>;

  const ls = LICENSE_STATUS_LABELS[tenant.license.status];
  const typeDisplay = getOrgTypeDisplay(extractOrgType(tenant));

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'basic', label: '基本信息', icon: Building2 },
    { key: 'members', label: `成员 (${tenant.members.length})`, icon: Users },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate('/admin/tenants')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> 返回租户列表
      </button>

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className={`w-12 h-12 ${typeDisplay.iconBgClass} rounded-xl flex items-center justify-center ${typeDisplay.iconColorClass} font-bold text-lg`}>
          {tenant.name.charAt(0)}
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{tenant.name}</h1>
          <p className="text-sm text-slate-400 font-mono">{tenant.slug}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${typeDisplay.badgeClass}`}>{typeDisplay.label}</span>
        {tenant.license.tier && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
            {TIER_LABELS[tenant.license.tier as OrgTier] || tenant.license.tier}
          </span>
        )}
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ls.color}`}>{ls.label}</span>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              tab === key ? 'border-blue-500 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'basic' && (
        <TenantBasicInfoTab
          tenant={tenant}
          serviceConfig={serviceConfig}
          onSaveMetadata={actions.saveTenantMetadata}
          onSaveAiConfig={actions.saveAiConfig}
          onSaveEmailConfig={actions.saveEmailConfig}
          onIssue={() => setShowIssueLicense(true)}
          onModify={openModifyLicense}
          onRenew={actions.renewLicense}
          onRevoke={actions.revokeLicense}
        />
      )}
      {tab === 'members' && (
        <TenantMembersTab
          members={tenant.members}
          onAddMember={() => setShowAddMember(true)}
          onChangeRole={actions.changeMemberRole}
          onSetClinicalPractitioner={actions.setClinicalPractitioner}
          onRemoveMember={actions.removeMember}
        />
      )}

      {showAddMember && (
        <AddMemberModal
          form={addMemberForm}
          error={addMemberError}
          onChange={(patch) => setAddMemberForm((f) => ({ ...f, ...patch }))}
          onClose={() => setShowAddMember(false)}
          onSubmit={() => actions.addMember(addMemberForm, setAddMemberError, () => {
            setShowAddMember(false);
            setAddMemberForm({ email: '', name: '', password: '', role: 'counselor' });
          })}
        />
      )}
      {showIssueLicense && (
        <IssueLicenseModal
          form={licenseForm}
          error={licenseError}
          onChange={(patch) => setLicenseForm((f) => ({ ...f, ...patch }))}
          onClose={() => setShowIssueLicense(false)}
          onSubmit={() => actions.issueLicense(licenseForm, setLicenseError, () => setShowIssueLicense(false))}
        />
      )}
      {showModifyLicense && (
        <ModifyLicenseModal
          form={modifyForm}
          error={modifyError}
          onChange={(patch) => setModifyForm((f) => ({ ...f, ...patch }))}
          onClose={() => setShowModifyLicense(false)}
          onSubmit={() => actions.modifyLicense(modifyForm, setModifyError, () => setShowModifyLicense(false))}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../../api/client';
import {
  ArrowLeft, Users, CreditCard, Building2,
  UserPlus, Trash2, Edit2, X, RefreshCw, Ban, Wrench, Save,
} from 'lucide-react';
import {
  TIER_LABELS,
  getOrgTypeDisplay,
  type OrgTier,
  type LicenseStatus,
} from '@psynote/shared';
import { getRoleLabel } from '../../../shared/constants/roles';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TenantDetailData {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: Record<string, unknown>;
  triageConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  members: MemberRow[];
  license: {
    status: LicenseStatus;
    tier: OrgTier | null;
    maxSeats: number | null;
    expiresAt: string | null;
    issuedAt: string | null;
  };
}

function extractOrgType(data: TenantDetailData | null): string {
  if (!data) return 'counseling';
  const s = data.settings as { orgType?: string } | null;
  return s?.orgType || 'counseling';
}

interface MemberRow {
  id: string;
  userId: string;
  role: string;
  status: string;
  createdAt: string;
  userName: string;
  userEmail: string;
}

type Tab = 'overview' | 'members' | 'subscription' | 'services';

interface ServiceConfig {
  aiConfig: { apiKey: string; baseUrl: string; model: string; monthlyTokenLimit: number };
  emailConfig: { smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string; senderName: string; senderEmail: string };
}

const ROLE_OPTIONS = ['org_admin', 'counselor', 'client'] as const;

const LICENSE_STATUS_LABELS: Record<LicenseStatus, { label: string; color: string }> = {
  active: { label: '有效', color: 'bg-green-100 text-green-700' },
  expired: { label: '已过期', color: 'bg-red-100 text-red-700' },
  invalid: { label: '无效', color: 'bg-orange-100 text-orange-700' },
  none: { label: '未签发', color: 'bg-slate-100 text-slate-500' },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TenantDetail() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  // Add member modal
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberForm, setAddMemberForm] = useState({ email: '', name: '', password: '', role: 'counselor' });
  const [addMemberError, setAddMemberError] = useState('');

  // License actions
  const [showIssueLicense, setShowIssueLicense] = useState(false);
  const [licenseForm, setLicenseForm] = useState({ tier: 'team' as OrgTier, maxSeats: 10, months: 12 });
  const [licenseError, setLicenseError] = useState('');

  // License modify
  const [showModifyLicense, setShowModifyLicense] = useState(false);
  const [modifyForm, setModifyForm] = useState({ tier: 'team' as OrgTier, maxSeats: 10 });
  const [modifyError, setModifyError] = useState('');

  // Services config
  const [serviceConfig, setServiceConfig] = useState<ServiceConfig | null>(null);
  const [serviceEditing, setServiceEditing] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);

  useEffect(() => {
    loadTenant();
  }, [orgId]);

  async function loadTenant() {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await api.get<TenantDetailData>(`/admin/tenants/${orgId}`);
      setTenant(data);
    } catch (err) {
      console.error('Failed to load tenant:', err);
    } finally {
      setLoading(false);
    }
  }

  async function addMember() {
    if (!orgId) return;
    setAddMemberError('');
    try {
      await api.post(`/admin/tenants/${orgId}/members`, addMemberForm);
      setShowAddMember(false);
      setAddMemberForm({ email: '', name: '', password: '', role: 'counselor' });
      await loadTenant();
    } catch (err: any) {
      setAddMemberError(err?.message || '添加失败');
    }
  }

  async function removeMember(memberId: string) {
    if (!orgId || !confirm('确定移除该成员？')) return;
    try {
      await api.delete(`/admin/tenants/${orgId}/members/${memberId}`);
      await loadTenant();
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  }

  async function changeMemberRole(memberId: string, role: string) {
    if (!orgId) return;
    try {
      await api.patch(`/admin/tenants/${orgId}/members/${memberId}`, { role });
      await loadTenant();
    } catch (err) {
      console.error('Failed to change role:', err);
    }
  }

  async function issueLicense() {
    if (!orgId) return;
    setLicenseError('');
    try {
      await api.post('/admin/licenses/issue', { orgId, ...licenseForm });
      setShowIssueLicense(false);
      await loadTenant();
    } catch (err: any) {
      setLicenseError(err?.message || '签发失败');
    }
  }

  async function renewLicense() {
    if (!orgId) return;
    try {
      await api.post('/admin/licenses/renew', { orgId, months: 12 });
      await loadTenant();
    } catch (err: any) {
      alert(err?.message || '续期失败');
    }
  }

  async function revokeLicense() {
    if (!orgId || !confirm('确定撤销该租户的许可证？')) return;
    try {
      await api.post('/admin/licenses/revoke', { orgId });
      await loadTenant();
    } catch (err: any) {
      alert(err?.message || '撤销失败');
    }
  }

  function openModifyLicense() {
    if (tenant?.license.tier) {
      setModifyForm({ tier: tenant.license.tier, maxSeats: tenant.license.maxSeats || 10 });
    }
    setModifyError('');
    setShowModifyLicense(true);
  }

  async function modifyLicense() {
    if (!orgId) return;
    setModifyError('');
    try {
      await api.post('/admin/licenses/modify', { orgId, ...modifyForm });
      setShowModifyLicense(false);
      await loadTenant();
    } catch (err: any) {
      setModifyError(err?.message || '修改失败');
    }
  }

  async function loadServices() {
    if (!orgId) return;
    try {
      const data = await api.get<ServiceConfig>(`/admin/tenants/${orgId}/services`);
      setServiceConfig(data);
    } catch (err) {
      console.error('Failed to load services:', err);
    }
  }

  async function saveServices() {
    if (!orgId || !serviceConfig) return;
    setServiceSaving(true);
    try {
      await api.patch(`/admin/tenants/${orgId}/services`, serviceConfig);
      setServiceEditing(false);
      await loadServices();
    } catch (err: any) {
      alert(err?.message || '保存失败');
    } finally {
      setServiceSaving(false);
    }
  }

  // Load services when switching to services tab
  useEffect(() => {
    if (tab === 'services' && !serviceConfig) loadServices();
  }, [tab]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <p className="text-slate-400">加载中...</p>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 rounded-lg p-4 text-sm">租户不存在或加载失败</div>
      </div>
    );
  }

  const ls = LICENSE_STATUS_LABELS[tenant.license.status];
  const orgType = extractOrgType(tenant);
  const typeDisplay = getOrgTypeDisplay(orgType);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate('/admin/tenants')}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        返回租户列表
      </button>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className={`w-12 h-12 ${typeDisplay.iconBgClass} rounded-xl flex items-center justify-center ${typeDisplay.iconColorClass} font-bold text-lg`}>
          {tenant.name.charAt(0)}
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{tenant.name}</h1>
          <p className="text-sm text-slate-400 font-mono">{tenant.slug}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${typeDisplay.badgeClass}`}>
          {typeDisplay.label}
        </span>
        {tenant.license.tier && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
            {TIER_LABELS[tenant.license.tier as OrgTier] || tenant.license.tier}
          </span>
        )}
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ls.color}`}>
          {ls.label}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {([
          { key: 'overview' as Tab, label: '概览', icon: Building2 },
          { key: 'members' as Tab, label: `成员 (${tenant.members.length})`, icon: Users },
          { key: 'subscription' as Tab, label: '订阅', icon: CreditCard },
          { key: 'services' as Tab, label: '服务配置', icon: Wrench },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              tab === key
                ? 'border-blue-500 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">基本信息</h3>
            <InfoRow label={typeDisplay.nameLabel} value={tenant.name} />
            <InfoRow label={typeDisplay.slugLabel} value={tenant.slug} mono />
            <InfoRow label="组织类型" value={typeDisplay.label} />
            <InfoRow label="创建时间" value={new Date(tenant.createdAt).toLocaleDateString('zh-CN')} />
            <InfoRow label="最后更新" value={new Date(tenant.updatedAt).toLocaleDateString('zh-CN')} />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">运营概况</h3>
            <InfoRow label="成员总数" value={String(tenant.members.length)} />
            <InfoRow label="活跃成员" value={String(tenant.members.filter((m) => m.status === 'active').length)} />
            <InfoRow label="许可状态" value={ls.label} />
            <InfoRow label="套餐等级" value={tenant.license.tier ? TIER_LABELS[tenant.license.tier as OrgTier] : '-'} />
            {tenant.license.expiresAt && (
              <InfoRow label="到期时间" value={new Date(tenant.license.expiresAt).toLocaleDateString('zh-CN')} />
            )}
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">成员列表</h3>
            <button
              onClick={() => setShowAddMember(true)}
              className="flex items-center gap-1 text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600"
            >
              <UserPlus className="w-3.5 h-3.5" />
              添加成员
            </button>
          </div>
          {tenant.members.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">暂无成员</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500">姓名</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">邮箱</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">角色</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">状态</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">加入时间</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tenant.members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 text-sm text-slate-900">{m.userName}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500">{m.userEmail}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={m.role}
                        onChange={(e) => changeMemberRole(m.id, e.target.value)}
                        className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-600"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{getRoleLabel(r)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs ${m.status === 'active' ? 'text-green-600' : 'text-slate-400'}`}>
                        {m.status === 'active' ? '活跃' : m.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      {new Date(m.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        onClick={() => removeMember(m.id)}
                        className="p-1 text-slate-300 hover:text-red-500 transition"
                        title="移除成员"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'subscription' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">当前订阅</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <InfoRow label="许可状态" value={ls.label} />
              <InfoRow label="套餐等级" value={tenant.license.tier ? TIER_LABELS[tenant.license.tier as OrgTier] : '-'} />
              <InfoRow label="席位上限" value={tenant.license.maxSeats ? String(tenant.license.maxSeats) : '-'} />
              <InfoRow label="已用席位" value={String(tenant.members.length)} />
              <InfoRow label="签发时间" value={tenant.license.issuedAt ? new Date(tenant.license.issuedAt).toLocaleDateString('zh-CN') : '-'} />
              <InfoRow label="到期时间" value={tenant.license.expiresAt ? new Date(tenant.license.expiresAt).toLocaleDateString('zh-CN') : '-'} />
            </div>
          </div>
          <div className="flex gap-3">
            {tenant.license.status === 'none' || tenant.license.status === 'expired' ? (
              <button
                onClick={() => setShowIssueLicense(true)}
                className="flex items-center gap-1.5 text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
              >
                <CreditCard className="w-4 h-4" />
                签发许可证
              </button>
            ) : (
              <>
                <button
                  onClick={openModifyLicense}
                  className="flex items-center gap-1.5 text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                >
                  <Edit2 className="w-4 h-4" />
                  修改
                </button>
                <button
                  onClick={renewLicense}
                  className="flex items-center gap-1.5 text-sm bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600"
                >
                  <RefreshCw className="w-4 h-4" />
                  续期 12 个月
                </button>
                <button
                  onClick={revokeLicense}
                  className="flex items-center gap-1.5 text-sm bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100"
                >
                  <Ban className="w-4 h-4" />
                  撤销许可证
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'services' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">增值服务配置</h3>
            {serviceEditing ? (
              <div className="flex gap-2">
                <button onClick={() => { setServiceEditing(false); loadServices(); }} className="text-sm text-slate-500 px-3 py-1.5">取消</button>
                <button onClick={saveServices} disabled={serviceSaving} className="flex items-center gap-1 text-sm bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" />
                  {serviceSaving ? '保存中...' : '保存'}
                </button>
              </div>
            ) : (
              <button onClick={() => setServiceEditing(true)} className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700">
                <Edit2 className="w-3.5 h-3.5" />
                编辑
              </button>
            )}
          </div>

          {!serviceConfig ? (
            <div className="text-sm text-slate-400 py-8 text-center">加载中...</div>
          ) : (
            <>
              {/* AI Service */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h4 className="text-sm font-semibold text-slate-700 mb-4">AI 服务</h4>
                <div className="grid grid-cols-2 gap-4">
                  <ServiceField label="API Key" value={serviceConfig.aiConfig.apiKey} field="aiConfig.apiKey" editing={serviceEditing} onChange={(v) => setServiceConfig((s) => s ? { ...s, aiConfig: { ...s.aiConfig, apiKey: v } } : s)} type="password" />
                  <ServiceField label="Base URL" value={serviceConfig.aiConfig.baseUrl} field="aiConfig.baseUrl" editing={serviceEditing} onChange={(v) => setServiceConfig((s) => s ? { ...s, aiConfig: { ...s.aiConfig, baseUrl: v } } : s)} />
                  <ServiceField label="模型" value={serviceConfig.aiConfig.model} field="aiConfig.model" editing={serviceEditing} onChange={(v) => setServiceConfig((s) => s ? { ...s, aiConfig: { ...s.aiConfig, model: v } } : s)} />
                  <ServiceField label="月 Token 限额" value={String(serviceConfig.aiConfig.monthlyTokenLimit || '')} field="aiConfig.monthlyTokenLimit" editing={serviceEditing} onChange={(v) => setServiceConfig((s) => s ? { ...s, aiConfig: { ...s.aiConfig, monthlyTokenLimit: parseInt(v) || 0 } } : s)} type="number" />
                </div>
              </div>

              {/* Email Service */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h4 className="text-sm font-semibold text-slate-700 mb-4">邮件服务</h4>
                <div className="grid grid-cols-2 gap-4">
                  <ServiceField label="SMTP 主机" value={serviceConfig.emailConfig.smtpHost} field="emailConfig.smtpHost" editing={serviceEditing} onChange={(v) => setServiceConfig((s) => s ? { ...s, emailConfig: { ...s.emailConfig, smtpHost: v } } : s)} />
                  <ServiceField label="SMTP 端口" value={String(serviceConfig.emailConfig.smtpPort)} field="emailConfig.smtpPort" editing={serviceEditing} onChange={(v) => setServiceConfig((s) => s ? { ...s, emailConfig: { ...s.emailConfig, smtpPort: parseInt(v) || 465 } } : s)} type="number" />
                  <ServiceField label="SMTP 用户" value={serviceConfig.emailConfig.smtpUser} field="emailConfig.smtpUser" editing={serviceEditing} onChange={(v) => setServiceConfig((s) => s ? { ...s, emailConfig: { ...s.emailConfig, smtpUser: v } } : s)} />
                  <ServiceField label="SMTP 密码" value={serviceConfig.emailConfig.smtpPass} field="emailConfig.smtpPass" editing={serviceEditing} onChange={(v) => setServiceConfig((s) => s ? { ...s, emailConfig: { ...s.emailConfig, smtpPass: v } } : s)} type="password" />
                  <ServiceField label="发件人名称" value={serviceConfig.emailConfig.senderName} field="emailConfig.senderName" editing={serviceEditing} onChange={(v) => setServiceConfig((s) => s ? { ...s, emailConfig: { ...s.emailConfig, senderName: v } } : s)} />
                  <ServiceField label="发件人邮箱" value={serviceConfig.emailConfig.senderEmail} field="emailConfig.senderEmail" editing={serviceEditing} onChange={(v) => setServiceConfig((s) => s ? { ...s, emailConfig: { ...s.emailConfig, senderEmail: v } } : s)} />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMember && (
        <Modal title="添加成员" onClose={() => setShowAddMember(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">姓名 *</label>
              <input
                type="text"
                value={addMemberForm.name}
                onChange={(e) => setAddMemberForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">邮箱 *</label>
              <input
                type="email"
                value={addMemberForm.email}
                onChange={(e) => setAddMemberForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">密码 *</label>
              <input
                type="password"
                value={addMemberForm.password}
                onChange={(e) => setAddMemberForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">角色</label>
              <select
                value={addMemberForm.role}
                onChange={(e) => setAddMemberForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{getRoleLabel(r)}</option>
                ))}
              </select>
            </div>
            {addMemberError && <p className="text-sm text-red-500">{addMemberError}</p>}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowAddMember(false)} className="text-sm text-slate-500 px-4 py-2">取消</button>
            <button onClick={addMember} className="text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">添加</button>
          </div>
        </Modal>
      )}

      {/* Issue License Modal */}
      {showIssueLicense && (
        <Modal title="签发许可证" onClose={() => setShowIssueLicense(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">套餐等级</label>
              <select
                value={licenseForm.tier}
                onChange={(e) => setLicenseForm((f) => ({ ...f, tier: e.target.value as OrgTier }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                {(Object.keys(TIER_LABELS) as OrgTier[]).map((t) => (
                  <option key={t} value={t}>{TIER_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">最大席位</label>
              <input
                type="number"
                min={1}
                value={licenseForm.maxSeats}
                onChange={(e) => setLicenseForm((f) => ({ ...f, maxSeats: parseInt(e.target.value) || 1 }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">有效期（月）</label>
              <input
                type="number"
                min={1}
                value={licenseForm.months}
                onChange={(e) => setLicenseForm((f) => ({ ...f, months: parseInt(e.target.value) || 12 }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            {licenseError && <p className="text-sm text-red-500">{licenseError}</p>}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowIssueLicense(false)} className="text-sm text-slate-500 px-4 py-2">取消</button>
            <button onClick={issueLicense} className="text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">签发</button>
          </div>
        </Modal>
      )}
      {/* Modify License Modal */}
      {showModifyLicense && (
        <Modal title="修改许可证" onClose={() => setShowModifyLicense(false)}>
          <div className="space-y-3">
            <p className="text-xs text-slate-500 mb-2">修改套餐等级和席位，到期时间保持不变。</p>
            <div>
              <label className="block text-sm text-slate-600 mb-1">套餐等级</label>
              <select
                value={modifyForm.tier}
                onChange={(e) => setModifyForm((f) => ({ ...f, tier: e.target.value as OrgTier }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                {(Object.keys(TIER_LABELS) as OrgTier[]).map((t) => (
                  <option key={t} value={t}>{TIER_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">最大席位</label>
              <input
                type="number"
                min={1}
                value={modifyForm.maxSeats}
                onChange={(e) => setModifyForm((f) => ({ ...f, maxSeats: parseInt(e.target.value) || 1 }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            {modifyError && <p className="text-sm text-red-500">{modifyError}</p>}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowModifyLicense(false)} className="text-sm text-slate-500 px-4 py-2">取消</button>
            <button onClick={modifyLicense} className="text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">确认修改</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

function ServiceField({ label, value, editing, onChange, type = 'text' }: {
  label: string; value: string; field: string; editing: boolean;
  onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      {editing ? (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
          placeholder={type === 'password' ? '输入新值或留空保持不变' : ''}
        />
      ) : (
        <div className="text-sm text-slate-900 py-1.5">{value || <span className="text-slate-400">未配置</span>}</div>
      )}
    </div>
  );
}

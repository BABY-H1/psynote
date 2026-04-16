/**
 * Phase 10 — Unified org settings page.
 *
 * 7-Tab layout consolidating all org-level settings:
 * 1. Basic Info — name, description, contact
 * 2. Members — existing MemberManagement component
 * 3. Branding — existing OrgBrandingSettings component
 * 4. Certifications — compliance certificate management
 * 5. Triage Rules — risk level configuration
 * 6. Data Policy — retention settings
 * 7. Audit Log — existing AuditLogViewer component
 */
import React, { useState } from 'react';
import {
  Building2, Users, Palette, ShieldCheck, FileSearch, Globe, Plus, Trash2, Handshake, GraduationCap, CreditCard,
} from 'lucide-react';
import { SchoolClassManagement } from './SchoolClassManagement';
import { MemberManagement } from './MemberManagement';
import { OrgBrandingSettings } from './OrgBrandingSettings';
import { AuditLogViewer } from '../../collaboration/AuditLogViewer';
import { LicenseCard } from '../components/LicenseCard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { useOrgMembers, type OrgMember } from '../../../api/useOrg';
import { useToast } from '../../../shared/components';
import { useFeature } from '../../../shared/hooks/useFeature';

type SettingsTab = 'basic' | 'services' | 'branding' | 'members' | 'classes' | 'partners' | 'subscription' | 'audit' | 'certifications';

interface TabDef {
  key: SettingsTab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  group: 'facade' | 'org' | 'business' | 'security';
  adminOnly?: boolean;
  requiresFeature?: string;
  hideForSolo?: boolean;
  onlyForOrgType?: string;
}

const GROUP_LABELS: Record<string, string> = {
  facade: '门面信息',
  org: '组织管理',
  business: '经营信息',
  security: '安全与合规',
};

const TABS: TabDef[] = [
  // 门面信息
  { key: 'basic', label: '基本信息', Icon: Building2, group: 'facade' },
  { key: 'services', label: '公开服务', Icon: Globe, group: 'facade', adminOnly: true, hideForSolo: true },
  { key: 'branding', label: '品牌定制', Icon: Palette, group: 'facade', adminOnly: true, requiresFeature: 'branding', hideForSolo: true },
  // 组织管理
  { key: 'members', label: '成员管理', Icon: Users, group: 'org', adminOnly: true, hideForSolo: true },
  { key: 'classes', label: '班级管理', Icon: GraduationCap, group: 'org', adminOnly: true, onlyForOrgType: 'school' },
  { key: 'partners', label: '合作机构', Icon: Handshake, group: 'org', adminOnly: true, requiresFeature: 'partnership', hideForSolo: true },
  // 经营信息
  { key: 'subscription', label: '订阅管理', Icon: CreditCard, group: 'business' },
  // 安全与合规
  { key: 'audit', label: '审计日志', Icon: FileSearch, group: 'security', adminOnly: true, hideForSolo: true },
  { key: 'certifications', label: '合规证书', Icon: ShieldCheck, group: 'security', adminOnly: true, hideForSolo: true },
];

const SETTINGS_TITLE: Record<string, string> = {
  solo: '个人设置',
  counseling: '机构设置',
  enterprise: '企业设置',
  school: '学校设置',
  hospital: '机构设置',
};

export function OrgSettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('basic');
  const { currentRole, currentOrgType } = useAuthStore();
  const isAdmin = currentRole === 'org_admin';
  const isSolo = currentOrgType === 'solo';
  const checkFeature = useFeature();

  const isSchool = currentOrgType === 'school';

  const visibleTabs = TABS
    .filter((t) => {
      if (t.hideForSolo && isSolo) return false;
      if (t.onlyForOrgType && t.onlyForOrgType !== currentOrgType) return false;
      if (t.adminOnly && !isAdmin && !isSolo) return false;
      if (t.requiresFeature && !checkFeature(t.requiresFeature as any)) return false;
      return true;
    })
    .map((t) => {
      if (t.key === 'members' && isSchool) return { ...t, label: '教师管理' };
      return t;
    });

  // Group visible tabs
  const groups = ['facade', 'org', 'business', 'security'] as const;
  const groupedTabs = groups
    .map((g) => ({ group: g, label: GROUP_LABELS[g], tabs: visibleTabs.filter((t) => t.group === g) }))
    .filter((g) => g.tabs.length > 0);

  const pageTitle = SETTINGS_TITLE[currentOrgType || 'counseling'] || '机构设置';

  // Active group determines which sub-tabs to show
  const activeGroup = groupedTabs.find((g) => g.tabs.some((t) => t.key === tab)) || groupedTabs[0];

  return (
    <div className="space-y-4">
      {/* Top-level group tabs */}
      <div className="flex border-b border-slate-200">
        {groupedTabs.map(({ group, label }) => (
          <button
            key={group}
            type="button"
            onClick={() => {
              // Switch to first tab in this group
              const firstTab = groupedTabs.find((g) => g.group === group)?.tabs[0];
              if (firstTab) setTab(firstTab.key);
            }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition ${
              activeGroup?.group === group
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Sub-tabs within active group (only if group has more than 1 tab) */}
      {activeGroup && activeGroup.tabs.length > 1 && (
        <div className="flex gap-1">
          {activeGroup.tabs.map(({ key, label: tabLabel, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 transition ${
                tab === key
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tabLabel}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div>
        {tab === 'basic' && <BasicInfoTab />}
        {tab === 'services' && <PublicServicesTab />}
        {tab === 'branding' && <OrgBrandingSettings />}
        {tab === 'members' && <MemberManagement />}
        {tab === 'classes' && <SchoolClassManagement />}
        {tab === 'partners' && <EAPPartnershipTab />}
        {tab === 'subscription' && <SubscriptionTab />}
        {tab === 'audit' && <AuditLogViewer />}
        {tab === 'certifications' && <CertificationsTab />}
      </div>
    </div>
  );
}

// ─── Basic Info Tab ─────────────────────────────────────────────────

function BasicInfoTab() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { data: org, isLoading } = useQuery({
    queryKey: ['org-detail', orgId],
    queryFn: () => api.get<{ id: string; name: string; slug: string; settings: any; createdAt: string }>(`/orgs/${orgId}`),
    enabled: !!orgId,
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [initialized, setInitialized] = useState(false);

  React.useEffect(() => {
    if (org && !initialized) {
      setName(org.name);
      setInitialized(true);
    }
  }, [org, initialized]);

  const updateOrg = useMutation({
    mutationFn: (data: { name: string }) => api.patch(`/orgs/${orgId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-detail'] });
      toast('已保存', 'success');
    },
  });

  if (isLoading) return <div className="text-sm text-slate-400">加载中…</div>;

  return (
    <div className="space-y-6 max-w-lg">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">机构名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">创建时间</label>
          <p className="text-sm text-slate-600">{org?.createdAt ? new Date(org.createdAt).toLocaleDateString('zh-CN') : '—'}</p>
        </div>
        <button
          type="button"
          onClick={() => updateOrg.mutate({ name })}
          disabled={updateOrg.isPending || name === org?.name}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {updateOrg.isPending ? '保存中…' : '保存'}
        </button>
      </div>

    </div>
  );
}

// ─── Subscription Tab (经营信息) ────────────────────────────────────

function SubscriptionTab() {
  const { currentOrgTier, currentOrgType } = useAuthStore();

  const tierLabel: Record<string, string> = { starter: '入门版', growth: '成长版', flagship: '旗舰版' };
  const typeLabel: Record<string, string> = { solo: '个体咨询师', counseling: '专业机构', enterprise: '企业', school: '学校', hospital: '医疗机构' };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-lg p-4">
          <span className="text-sm text-slate-500">当前套餐</span>
          <p className="text-lg font-bold text-slate-900 mt-1">
            {tierLabel[currentOrgTier || 'starter'] || '入门版'}
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg p-4">
          <span className="text-sm text-slate-500">组织类型</span>
          <p className="text-lg font-bold text-slate-900 mt-1">
            {typeLabel[currentOrgType || 'counseling'] || '专业机构'}
          </p>
        </div>
      </div>

      <LicenseCard />
    </div>
  );
}

// ─── Certifications Tab ─────────────────────────────────────────────

function CertificationsTab() {
  const { data: members = [], isLoading } = useOrgMembers();
  const qc = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { toast } = useToast();

  const counselors = members.filter((m) => m.role === 'counselor' || m.role === 'org_admin');

  const updateCerts = useMutation({
    mutationFn: ({ memberId, certifications }: { memberId: string; certifications: any[] }) =>
      api.patch(`/orgs/${orgId}/members/${memberId}`, { certifications }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      toast('证书已更新', 'success');
    },
  });

  if (isLoading) return <div className="text-sm text-slate-400">加载中…</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">管理咨询师的执业资质证书，过期证书将高亮预警。</p>

      {counselors.length === 0 && (
        <div className="text-sm text-slate-400">暂无咨询师</div>
      )}

      {counselors.map((m) => {
        const certs = (m.certifications ?? []) as Array<{
          name: string; issuer: string; number: string; issuedAt: string; expiresAt?: string;
        }>;
        const now = new Date();

        return (
          <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">{m.name}</div>
                <div className="text-xs text-slate-400">{m.email} · {m.role}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newCert = {
                    name: '',
                    issuer: '',
                    number: '',
                    issuedAt: new Date().toISOString().slice(0, 10),
                  };
                  updateCerts.mutate({ memberId: m.id, certifications: [...certs, newCert] });
                }}
                className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
              >
                + 添加证书
              </button>
            </div>

            {certs.length === 0 ? (
              <div className="text-xs text-slate-400">暂无证书记录</div>
            ) : (
              <div className="space-y-2">
                {certs.map((cert, idx) => {
                  const isExpiring = cert.expiresAt && new Date(cert.expiresAt) <= new Date(now.getTime() + 30 * 86400000);
                  const isExpired = cert.expiresAt && new Date(cert.expiresAt) < now;

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between text-xs p-2 rounded ${
                        isExpired ? 'bg-red-50 border border-red-200' :
                        isExpiring ? 'bg-amber-50 border border-amber-200' :
                        'bg-slate-50'
                      }`}
                    >
                      <div>
                        <span className="font-medium text-slate-700">{cert.name || '(未命名证书)'}</span>
                        {cert.issuer && <span className="text-slate-400 ml-2">· {cert.issuer}</span>}
                        {cert.number && <span className="text-slate-400 ml-2">#{cert.number}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {isExpired && <span className="text-red-600 font-medium">已过期</span>}
                        {isExpiring && !isExpired && <span className="text-amber-600 font-medium">即将过期</span>}
                        {cert.expiresAt && (
                          <span className="text-slate-400">{cert.expiresAt}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const updated = certs.filter((_, i) => i !== idx);
                            updateCerts.mutate({ memberId: m.id, certifications: updated });
                          }}
                          className="text-red-400 hover:text-red-600"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Public Services Tab ────────────────────────────────────────────

interface PublicService {
  id: string;
  title: string;
  description: string;
  sessionFormat: 'individual' | 'family' | 'couple';
  targetAudience?: string;
  availableCounselorIds: string[];
  intakeMode: 'booking' | 'application';
  isActive: boolean;
}

const FORMAT_LABELS: Record<string, string> = {
  individual: '个案咨询',
  family: '家庭治疗',
  couple: '伴侣咨询',
};

const MODE_LABELS: Record<string, string> = {
  booking: '预约制（来访者直接选时段）',
  application: '申请制（管理员审核分配）',
};

// ─── EAP Partnership Tab ──────────────────────────────────────────

function EAPPartnershipTab() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Load partnerships where this org is the provider
  const { data: partnershipData, isLoading } = useQuery({
    queryKey: ['eap-partnerships', orgId],
    queryFn: () => api.get<{ partnerships: any[] }>(`/orgs/${orgId}/eap/partnerships`),
    enabled: !!orgId,
  });

  // Load assignments
  const { data: assignmentData } = useQuery({
    queryKey: ['eap-assignments', orgId],
    queryFn: () => api.get<{ assignments: any[] }>(`/orgs/${orgId}/eap/assignments`),
    enabled: !!orgId,
  });

  // Load org counselors for the assignment dropdown
  const { data: members } = useOrgMembers();
  const counselors = (members || []).filter((m) => m.role === 'counselor');

  const [assigningFor, setAssigningFor] = useState<string | null>(null); // partnershipId
  const [selectedCounselor, setSelectedCounselor] = useState('');

  const partnerships = partnershipData?.partnerships || [];
  const assignments = assignmentData?.assignments || [];

  // Filter to show only partnerships where this org is the provider
  const providerPartnerships = partnerships.filter((p: any) => p.role === 'provider');

  async function handleAssign(partnershipId: string) {
    if (!selectedCounselor || !orgId) return;
    try {
      await api.post(`/orgs/${orgId}/eap/assignments`, {
        partnershipId,
        counselorUserId: selectedCounselor,
      });
      toast('咨询师已指派', 'success');
      setAssigningFor(null);
      setSelectedCounselor('');
      qc.invalidateQueries({ queryKey: ['eap-assignments'] });
      qc.invalidateQueries({ queryKey: ['eap-partnerships'] });
    } catch (err: any) {
      toast(err?.message || '指派失败', 'error');
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    if (!orgId) return;
    try {
      await api.delete(`/orgs/${orgId}/eap/assignments/${assignmentId}`);
      toast('已撤回指派', 'success');
      qc.invalidateQueries({ queryKey: ['eap-assignments'] });
      qc.invalidateQueries({ queryKey: ['eap-partnerships'] });
    } catch (err: any) {
      toast(err?.message || '撤回失败', 'error');
    }
  }

  if (isLoading) {
    return <div className="text-slate-400 text-sm py-8 text-center">加载中...</div>;
  }

  if (providerPartnerships.length === 0) {
    return (
      <div className="text-center py-12">
        <Handshake className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">暂无 EAP 合作关系</p>
        <p className="text-slate-400 text-xs mt-1">当系统管理员创建企业版租户并绑定您的机构时，合作关系会自动出现在这里</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">管理与企业客户的 EAP 合作关系，指派咨询师提供服务</p>

      {providerPartnerships.map((p: any) => {
        const partnershipAssignments = assignments.filter((a: any) => a.partnershipId === p.id);
        // Find counselors already assigned to avoid duplicates
        const assignedCounselorIds = new Set(partnershipAssignments.map((a: any) => a.counselorUserId));
        const availableCounselors = counselors.filter((c) => !assignedCounselorIds.has(c.userId));

        return (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Partnership Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{p.partnerOrg?.name}</h3>
                  <p className="text-xs text-slate-400">企业客户 · {p.assignedCounselorCount || 0} 名咨询师已指派</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${
                p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {p.status === 'active' ? '合作中' : p.status}
              </span>
            </div>

            {/* Assigned Counselors */}
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-700">已指派咨询师</span>
                {p.status === 'active' && (
                  <button
                    onClick={() => setAssigningFor(assigningFor === p.id ? null : p.id)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    指派咨询师
                  </button>
                )}
              </div>

              {partnershipAssignments.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">暂未指派咨询师</p>
              ) : (
                <div className="space-y-2">
                  {partnershipAssignments.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                      <div>
                        <span className="text-sm text-slate-700">{a.counselorName || '未知'}</span>
                        <span className="text-xs text-slate-400 ml-2">{a.counselorEmail}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveAssignment(a.id)}
                        className="text-xs text-red-500 hover:text-red-600"
                      >
                        撤回
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Assignment Form */}
              {assigningFor === p.id && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  <div className="flex gap-2">
                    <select
                      value={selectedCounselor}
                      onChange={(e) => setSelectedCounselor(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">选择咨询师...</option>
                      {availableCounselors.map((c) => (
                        <option key={c.userId} value={c.userId}>
                          {c.name} ({c.email})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAssign(p.id)}
                      disabled={!selectedCounselor}
                      className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
                    >
                      确认指派
                    </button>
                  </div>
                  {availableCounselors.length === 0 && (
                    <p className="text-xs text-blue-600 mt-2">所有咨询师已指派，无可用人选</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Public Services Tab ──────────────────────────────────────────

function PublicServicesTab() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { data: org, isLoading } = useQuery({
    queryKey: ['org-detail', orgId],
    queryFn: () => api.get<{ id: string; slug: string; settings: any }>(`/orgs/${orgId}`),
    enabled: !!orgId,
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: members = [] } = useOrgMembers();
  const counselors = members.filter((m) => m.role === 'counselor' && m.status === 'active');

  const services: PublicService[] = (org?.settings as any)?.publicServices ?? [];

  const updateServices = useMutation({
    mutationFn: (updated: PublicService[]) =>
      api.patch(`/orgs/${orgId}`, {
        settings: { ...((org?.settings as any) ?? {}), publicServices: updated },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-detail'] });
      toast('服务配置已保存', 'success');
    },
  });

  function addService() {
    const newSvc: PublicService = {
      id: crypto.randomUUID(),
      title: '新服务项目',
      description: '',
      sessionFormat: 'individual',
      targetAudience: '',
      availableCounselorIds: counselors.map((c) => c.userId),
      intakeMode: 'booking',
      isActive: false,
    };
    updateServices.mutate([...services, newSvc]);
  }

  function updateOne(idx: number, patch: Partial<PublicService>) {
    const updated = services.map((s, i) => i === idx ? { ...s, ...patch } : s);
    updateServices.mutate(updated);
  }

  function removeService(idx: number) {
    updateServices.mutate(services.filter((_, i) => i !== idx));
  }

  if (isLoading) return <div className="text-sm text-slate-400">加载中…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">配置对外公开的咨询服务项目。来访者通过 Portal 浏览并申请。</p>
          {org?.slug && (
            <p className="text-xs text-slate-400 mt-1">
              机构 Portal 地址：<code className="bg-slate-100 px-1 rounded">/public/orgs/{org.slug}/services</code>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={addService}
          disabled={updateServices.isPending}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> 新增服务
        </button>
      </div>

      {services.length === 0 && (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
          <Globe className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">暂未配置公开服务</p>
          <p className="text-xs text-slate-400 mt-1">点击上方"新增服务"开始配置</p>
        </div>
      )}

      {services.map((svc, idx) => (
        <div key={svc.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={svc.title}
                onChange={(e) => updateOne(idx, { title: e.target.value })}
                onBlur={() => updateServices.mutate(services)}
                className="text-sm font-semibold text-slate-800 border-none bg-transparent p-0 focus:ring-0 focus:outline-none"
                placeholder="服务名称"
              />
              <span className={`text-xs px-2 py-0.5 rounded-full ${svc.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {svc.isActive ? '已发布' : '草稿'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateOne(idx, { isActive: !svc.isActive })}
                className="text-xs text-blue-600 hover:underline"
              >
                {svc.isActive ? '停用' : '发布'}
              </button>
              <button
                type="button"
                onClick={() => removeService(idx)}
                className="p-1 text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">服务描述</label>
              <textarea
                value={svc.description}
                onChange={(e) => updateOne(idx, { description: e.target.value })}
                onBlur={() => updateServices.mutate(services)}
                rows={2}
                className="w-full text-xs border border-slate-200 rounded px-2 py-1"
                placeholder="服务描述…"
              />
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">服务形式</label>
                <select
                  value={svc.sessionFormat}
                  onChange={(e) => updateOne(idx, { sessionFormat: e.target.value as any })}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1"
                >
                  {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">入口模式</label>
                <select
                  value={svc.intakeMode}
                  onChange={(e) => updateOne(idx, { intakeMode: e.target.value as any })}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1"
                >
                  {Object.entries(MODE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">目标受众</label>
            <input
              type="text"
              value={svc.targetAudience ?? ''}
              onChange={(e) => updateOne(idx, { targetAudience: e.target.value })}
              onBlur={() => updateServices.mutate(services)}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1"
              placeholder="如：12-18岁青少年"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">可接诊咨询师（{svc.availableCounselorIds.length}人）</label>
            <div className="flex flex-wrap gap-1">
              {counselors.map((c) => {
                const selected = svc.availableCounselorIds.includes(c.userId);
                return (
                  <button
                    key={c.userId}
                    type="button"
                    onClick={() => {
                      const ids = selected
                        ? svc.availableCounselorIds.filter((id) => id !== c.userId)
                        : [...svc.availableCounselorIds, c.userId];
                      updateOne(idx, { availableCounselorIds: ids });
                    }}
                    className={`text-xs px-2 py-1 rounded-full transition ${
                      selected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

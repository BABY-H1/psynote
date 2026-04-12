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
  Building2, Users, Palette, ShieldCheck, AlertTriangle, Database, FileSearch, Globe, Plus, Trash2,
} from 'lucide-react';
import { MemberManagement } from './MemberManagement';
import { OrgBrandingSettings } from './OrgBrandingSettings';
import { AuditLogViewer } from '../../collaboration/AuditLogViewer';
import { LicenseCard } from '../components/LicenseCard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { useOrgMembers, type OrgMember } from '../../../api/useOrg';
import { useToast } from '../../../shared/components';
import { useHasFeature } from '../../../shared/hooks/useFeature';

type SettingsTab = 'basic' | 'members' | 'branding' | 'services' | 'certifications' | 'triage' | 'data-policy' | 'audit';

const TABS: { key: SettingsTab; label: string; Icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean; requiresFeature?: string }[] = [
  { key: 'basic', label: '基本信息', Icon: Building2 },
  { key: 'members', label: '成员管理', Icon: Users },
  { key: 'services', label: '公开服务', Icon: Globe },
  { key: 'branding', label: '品牌定制', Icon: Palette, requiresFeature: 'branding' },
  { key: 'certifications', label: '合规证书', Icon: ShieldCheck },
  { key: 'triage', label: '分诊规则', Icon: AlertTriangle },
  { key: 'data-policy', label: '数据策略', Icon: Database },
  { key: 'audit', label: '审计日志', Icon: FileSearch },
];

export function OrgSettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('basic');
  const hasBranding = useHasFeature('branding');

  const visibleTabs = TABS.filter((t) => {
    if (t.requiresFeature === 'branding' && !hasBranding) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">机构设置</h1>
        <p className="text-sm text-slate-500 mt-1">管理机构信息、成员、合规与策略</p>
      </div>

      <div className="flex border-b border-slate-200 overflow-x-auto">
        {visibleTabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap ${
              tab === key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'basic' && <BasicInfoTab />}
        {tab === 'members' && <MemberManagement />}
        {tab === 'services' && <PublicServicesTab />}
        {tab === 'branding' && <OrgBrandingSettings />}
        {tab === 'certifications' && <CertificationsTab />}
        {tab === 'triage' && <TriageConfigTab />}
        {tab === 'data-policy' && <DataPolicyTab />}
        {tab === 'audit' && <AuditLogViewer />}
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
          <label className="block text-sm font-medium text-slate-700 mb-1">机构标识 (slug)</label>
          <input
            type="text"
            value={org?.slug ?? ''}
            disabled
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-500"
          />
          <p className="text-xs text-slate-400 mt-1">机构标识创建后不可修改</p>
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

      {/* License info & activation */}
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

// ─── Triage Config Tab ──────────────────────────────────────────────

function TriageConfigTab() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { data: config, isLoading } = useQuery({
    queryKey: ['triage-config', orgId],
    queryFn: () => api.get<any>(`/orgs/${orgId}/triage-config`),
    enabled: !!orgId,
  });
  const { toast } = useToast();
  const [editConfig, setEditConfig] = useState<string>('');
  const [initialized, setInitialized] = useState(false);

  React.useEffect(() => {
    if (config && !initialized) {
      setEditConfig(JSON.stringify(config, null, 2));
      setInitialized(true);
    }
  }, [config, initialized]);

  const updateConfig = useMutation({
    mutationFn: (data: unknown) => api.put(`/orgs/${orgId}/triage-config`, data),
    onSuccess: () => toast('分诊规则已保存', 'success'),
    onError: () => toast('保存失败，请检查 JSON 格式', 'error'),
  });

  if (isLoading) return <div className="text-sm text-slate-400">加载中…</div>;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 max-w-2xl">
      <p className="text-sm text-slate-500">
        配置风险等级分诊规则。修改后保存即可生效。
      </p>
      <textarea
        value={editConfig}
        onChange={(e) => setEditConfig(e.target.value)}
        rows={16}
        className="w-full font-mono text-xs border border-slate-200 rounded-lg px-3 py-2"
      />
      <button
        type="button"
        onClick={() => {
          try {
            const parsed = JSON.parse(editConfig);
            updateConfig.mutate(parsed);
          } catch {
            toast('JSON 格式错误', 'error');
          }
        }}
        disabled={updateConfig.isPending}
        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {updateConfig.isPending ? '保存中…' : '保存'}
      </button>
    </div>
  );
}

// ─── Data Policy Tab ────────────────────────────────────────────────

function DataPolicyTab() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { data: org, isLoading } = useQuery({
    queryKey: ['org-detail', orgId],
    queryFn: () => api.get<{ dataRetentionPolicy: any }>(`/orgs/${orgId}`),
    enabled: !!orgId,
  });
  const { toast } = useToast();
  const [policy, setPolicy] = useState({ archiveAfterDays: 90, retainAfterDays: 365 });
  const [initialized, setInitialized] = useState(false);

  React.useEffect(() => {
    if (org?.dataRetentionPolicy && !initialized) {
      setPolicy({
        archiveAfterDays: org.dataRetentionPolicy.archiveAfterDays ?? 90,
        retainAfterDays: org.dataRetentionPolicy.retainAfterDays ?? 365,
      });
      setInitialized(true);
    }
  }, [org, initialized]);

  const updatePolicy = useMutation({
    mutationFn: () => api.patch(`/orgs/${orgId}`, { settings: { dataRetentionPolicy: policy } }),
    onSuccess: () => toast('数据策略已保存', 'success'),
  });

  if (isLoading) return <div className="text-sm text-slate-400">加载中…</div>;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 max-w-lg">
      <p className="text-sm text-slate-500">
        配置数据保留策略。目前仅为配置项，不会自动执行删除操作。
      </p>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">结案后归档天数</label>
        <input
          type="number"
          value={policy.archiveAfterDays}
          onChange={(e) => setPolicy({ ...policy, archiveAfterDays: Number(e.target.value) })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">归档后保留天数</label>
        <input
          type="number"
          value={policy.retainAfterDays}
          onChange={(e) => setPolicy({ ...policy, retainAfterDays: Number(e.target.value) })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-xs text-amber-700">
          注意：此策略目前仅为配置参考，系统不会自动删除或归档数据。未来版本将支持自动执行。
        </p>
      </div>
      <button
        type="button"
        onClick={() => updatePolicy.mutate()}
        disabled={updatePolicy.isPending}
        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {updatePolicy.isPending ? '保存中…' : '保存'}
      </button>
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

import React, { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { Lock, Mail, Bot, Globe, RefreshCw, Pencil, Save, X, AlertTriangle, Gauge } from 'lucide-react';

interface SystemConfigData {
  platform: { name: string; version: string };
  security: { accessTokenExpiry: string; refreshTokenExpiry: string; minPasswordLength: number };
  defaults: { orgPlan: string; maxMembersPerOrg: number };
  limits: { rateLimitMax: number; fileUploadMaxMB: number };
  email: { configured: boolean; host: string };
  ai: { configured: boolean; model: string; baseUrl: string };
  _meta: { restartRequired: string[]; lastUpdated: string | null };
}

const PLAN_LABELS: Record<string, string> = { free: '免费版', pro: '专业版', enterprise: '企业版' };
const PLAN_OPTIONS = ['free', 'pro', 'enterprise'];

export function SystemConfig() {
  const [config, setConfig] = useState<SystemConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const data = await api.get<SystemConfigData>('/admin/config');
      setConfig(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(section: string) {
    if (!config) return;
    const sectionData = (config as any)[section];
    setDraft({ ...sectionData });
    setEditingSection(section);
  }

  function cancelEdit() {
    setEditingSection(null);
    setDraft({});
  }

  async function saveEdit() {
    if (!editingSection) return;
    setSaving(true);
    try {
      await api.patch('/admin/config', { [editingSection]: draft });
      await loadConfig();
      setEditingSection(null);
      setDraft({});
      showToast('配置已保存');
    } catch (err: any) {
      showToast(err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function updateDraft(key: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400">加载中...</div>;
  if (!config) return <div className="flex items-center justify-center py-20 text-slate-400">加载失败</div>;

  const restartKeys = config._meta?.restartRequired ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">系统配置</h2>
        <button onClick={loadConfig} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
          <RefreshCw className="w-3.5 h-3.5" /> 刷新
        </button>
      </div>

      {/* Restart warning banner */}
      {restartKeys.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">部分配置变更需要重启服务后生效</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {restartKeys.map((k) => k.split('.')[1]).join('、')}
            </p>
          </div>
        </div>
      )}

      {/* Platform */}
      <ConfigSection
        icon={<Globe className="w-4 h-4 text-blue-500" />}
        title="平台信息"
        editing={editingSection === 'platform'}
        onEdit={() => startEdit('platform')}
        onSave={saveEdit}
        onCancel={cancelEdit}
        saving={saving}
      >
        {editingSection === 'platform' ? (
          <>
            <EditableRow label="平台名称" value={draft.name as string} onChange={(v) => updateDraft('name', v)} />
            <EditableRow label="版本" value={draft.version as string} onChange={(v) => updateDraft('version', v)} />
          </>
        ) : (
          <>
            <ConfigRow label="平台名称" value={config.platform.name} />
            <ConfigRow label="版本" value={config.platform.version} />
          </>
        )}
      </ConfigSection>

      {/* Security */}
      <ConfigSection
        icon={<Lock className="w-4 h-4 text-amber-500" />}
        title="安全策略"
        editing={editingSection === 'security'}
        onEdit={() => startEdit('security')}
        onSave={saveEdit}
        onCancel={cancelEdit}
        saving={saving}
        hint="Token 有效期修改需要重启服务后生效"
      >
        {editingSection === 'security' ? (
          <>
            <EditableRow label="Access Token 有效期" value={draft.accessTokenExpiry as string} onChange={(v) => updateDraft('accessTokenExpiry', v)} placeholder="如 7d, 24h" />
            <EditableRow label="Refresh Token 有效期" value={draft.refreshTokenExpiry as string} onChange={(v) => updateDraft('refreshTokenExpiry', v)} placeholder="如 30d" />
            <EditableRow label="最小密码长度" value={String(draft.minPasswordLength ?? '')} onChange={(v) => updateDraft('minPasswordLength', parseInt(v) || 0)} type="number" />
          </>
        ) : (
          <>
            <ConfigRow label="Access Token 有效期" value={config.security.accessTokenExpiry} />
            <ConfigRow label="Refresh Token 有效期" value={config.security.refreshTokenExpiry} />
            <ConfigRow label="最小密码长度" value={`${config.security.minPasswordLength} 位`} />
          </>
        )}
      </ConfigSection>

      {/* Defaults */}
      <ConfigSection
        icon={<Globe className="w-4 h-4 text-green-500" />}
        title="默认设置"
        editing={editingSection === 'defaults'}
        onEdit={() => startEdit('defaults')}
        onSave={saveEdit}
        onCancel={cancelEdit}
        saving={saving}
      >
        {editingSection === 'defaults' ? (
          <>
            <div className="px-5 py-2.5 flex items-center justify-between">
              <span className="text-sm text-slate-500">新机构默认套餐</span>
              <select
                className="text-sm border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={draft.orgPlan as string}
                onChange={(e) => updateDraft('orgPlan', e.target.value)}
              >
                {PLAN_OPTIONS.map((p) => (
                  <option key={p} value={p}>{PLAN_LABELS[p] || p}</option>
                ))}
              </select>
            </div>
            <EditableRow label="每机构最大成员数" value={String(draft.maxMembersPerOrg ?? '')} onChange={(v) => updateDraft('maxMembersPerOrg', parseInt(v) || 0)} type="number" />
          </>
        ) : (
          <>
            <ConfigRow label="新机构默认套餐" value={PLAN_LABELS[config.defaults.orgPlan] || config.defaults.orgPlan} />
            <ConfigRow label="每机构最大成员数" value={`${config.defaults.maxMembersPerOrg} 人`} />
          </>
        )}
      </ConfigSection>

      {/* Limits */}
      <ConfigSection
        icon={<Gauge className="w-4 h-4 text-orange-500" />}
        title="系统限制"
        editing={editingSection === 'limits'}
        onEdit={() => startEdit('limits')}
        onSave={saveEdit}
        onCancel={cancelEdit}
        saving={saving}
        hint="限制修改需要重启服务后生效"
      >
        {editingSection === 'limits' ? (
          <>
            <EditableRow label="每分钟最大请求数" value={String(draft.rateLimitMax ?? '')} onChange={(v) => updateDraft('rateLimitMax', parseInt(v) || 0)} type="number" />
            <EditableRow label="文件上传限制 (MB)" value={String(draft.fileUploadMaxMB ?? '')} onChange={(v) => updateDraft('fileUploadMaxMB', parseInt(v) || 0)} type="number" />
          </>
        ) : (
          <>
            <ConfigRow label="每分钟最大请求数" value={`${config.limits.rateLimitMax} 次`} />
            <ConfigRow label="文件上传限制" value={`${config.limits.fileUploadMaxMB} MB`} />
          </>
        )}
      </ConfigSection>

      {/* Note: Email and AI service configs are now per-tenant, managed in Tenant Detail → 服务配置 tab */}
    </div>
  );
}

function ConfigSection({
  icon, title, children, editing, onEdit, onSave, onCancel, saving, hint, readOnly,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  editing?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  saving?: boolean;
  hint?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {readOnly && <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">只读</span>}
        </div>
        {!readOnly && !editing && (
          <button onClick={onEdit} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <Pencil className="w-3 h-3" /> 编辑
          </button>
        )}
        {editing && (
          <div className="flex items-center gap-2">
            <button onClick={onCancel} disabled={saving} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
              <X className="w-3 h-3" /> 取消
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1 text-xs bg-blue-500 text-white px-2.5 py-1 rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              <Save className="w-3 h-3" /> {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
      {hint && !editing && (
        <p className="text-xs text-slate-400 px-5 py-2 border-t border-slate-50">{hint}</p>
      )}
    </div>
  );
}

function ConfigRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="px-5 py-2.5 flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-medium ${valueClass || 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function EditableRow({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'number';
  placeholder?: string;
}) {
  return (
    <div className="px-5 py-2.5 flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm text-right border border-slate-200 rounded-lg px-2 py-1 w-32 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
    </div>
  );
}

import { useState } from 'react';
import { Ban, CreditCard, Edit2, Loader2, RefreshCw, Save } from 'lucide-react';
import { TIER_LABELS, type OrgTier } from '@psynote/shared';
import { InfoRow, ServiceField } from './TenantDetailPrimitives';
import {
  LICENSE_STATUS_LABELS,
  type BasicInfoDraft,
  type ServiceConfig,
  type TenantDetailData,
} from './types';

const ORG_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'solo', label: '个体咨询师' },
  { value: 'counseling', label: '专业机构' },
  { value: 'enterprise', label: '企业' },
  { value: 'school', label: '学校' },
  { value: 'hospital', label: '医疗机构' },
];

const ORG_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ORG_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

function extractOrgTypeFromTenant(tenant: TenantDetailData): string {
  return (tenant.settings as { orgType?: string } | null)?.orgType || 'counseling';
}

/**
 * Consolidated basic-info tab — per-card edit mode.
 *
 * Each editable card owns its own local draft + editing flag; saves only
 * patch the fields that card owns. This replaces the earlier single
 * global edit mode (2026-04, see git log) — users complained that a
 * top-level "修改" button toggling inputs across 3 disconnected cards
 * felt fragmented. Now each card reads as a self-contained unit, which
 * also matches the existing "订阅" pattern (its own action buttons).
 *
 * Read-only cards (运营概况) just render info rows. The subscription card
 * keeps its modal-driven license lifecycle buttons — those are the
 * right affordance for discrete transactions (issue / renew / modify /
 * revoke) that have their own validation, not simple field edits.
 */
export function TenantBasicInfoTab({
  tenant,
  serviceConfig,
  onSaveMetadata,
  onSaveAiConfig,
  onSaveEmailConfig,
  onIssue,
  onModify,
  onRenew,
  onRevoke,
}: {
  tenant: TenantDetailData;
  serviceConfig: ServiceConfig | null;
  onSaveMetadata: (draft: BasicInfoDraft) => Promise<void>;
  onSaveAiConfig: (aiConfig: ServiceConfig['aiConfig']) => Promise<void>;
  onSaveEmailConfig: (emailConfig: ServiceConfig['emailConfig']) => Promise<void>;
  onIssue: () => void;
  onModify: () => void;
  onRenew: () => void;
  onRevoke: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <BasicInfoCard tenant={tenant} onSave={onSaveMetadata} />
        <OperationsSummaryCard tenant={tenant} />
      </div>

      <SubscriptionCard
        tenant={tenant}
        onIssue={onIssue}
        onModify={onModify}
        onRenew={onRenew}
        onRevoke={onRevoke}
      />

      {serviceConfig ? (
        <>
          <AiServiceCard config={serviceConfig.aiConfig} onSave={onSaveAiConfig} />
          <EmailServiceCard config={serviceConfig.emailConfig} onSave={onSaveEmailConfig} />
        </>
      ) : (
        <div className="text-sm text-slate-400 py-8 text-center">加载服务配置中...</div>
      )}
    </div>
  );
}

/* ================================================================ */
/*  基本信息 — name + orgType                                         */
/* ================================================================ */

function BasicInfoCard({
  tenant,
  onSave,
}: {
  tenant: TenantDetailData;
  onSave: (draft: BasicInfoDraft) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const initial: BasicInfoDraft = {
    name: tenant.name,
    orgType: extractOrgTypeFromTenant(tenant),
  };
  const [draft, setDraft] = useState<BasicInfoDraft>(initial);

  function startEdit() {
    setDraft({ name: tenant.name, orgType: extractOrgTypeFromTenant(tenant) });
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      /* alert surfaced upstream */
    } finally {
      setSaving(false);
    }
  }

  return (
    <CardShell
      title="基本信息"
      editing={editing}
      saving={saving}
      onStartEdit={startEdit}
      onCancel={() => setEditing(false)}
      onSave={handleSave}
    >
      {editing ? (
        <>
          <EditableRow label="机构名称">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className={fieldInput}
            />
          </EditableRow>
          <InfoRow label="标识 (slug)" value={tenant.slug} mono />
          <EditableRow label="组织类型">
            <select
              value={draft.orgType}
              onChange={(e) => setDraft((d) => ({ ...d, orgType: e.target.value }))}
              className={`${fieldInput} bg-white`}
            >
              {ORG_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </EditableRow>
        </>
      ) : (
        <>
          <InfoRow label="机构名称" value={tenant.name} />
          <InfoRow label="标识 (slug)" value={tenant.slug} mono />
          <InfoRow
            label="组织类型"
            value={ORG_TYPE_LABEL[extractOrgTypeFromTenant(tenant)] ?? ORG_TYPE_LABEL.counseling}
          />
        </>
      )}
      <InfoRow label="创建时间" value={new Date(tenant.createdAt).toLocaleDateString('zh-CN')} />
      <InfoRow label="最后更新" value={new Date(tenant.updatedAt).toLocaleDateString('zh-CN')} />
    </CardShell>
  );
}

/* ================================================================ */
/*  运营概况 — read-only derived stats                                */
/* ================================================================ */

function OperationsSummaryCard({ tenant }: { tenant: TenantDetailData }) {
  const ls = LICENSE_STATUS_LABELS[tenant.license.status];
  const tierLabel = tenant.license.tier ? TIER_LABELS[tenant.license.tier as OrgTier] : '-';
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">运营概况</h3>
      <InfoRow label="成员总数" value={String(tenant.members.length)} />
      <InfoRow
        label="活跃成员"
        value={String(tenant.members.filter((m) => m.status === 'active').length)}
      />
      <InfoRow label="许可状态" value={ls.label} />
      <InfoRow label="套餐等级" value={tierLabel} />
      {tenant.license.expiresAt && (
        <InfoRow
          label="到期时间"
          value={new Date(tenant.license.expiresAt).toLocaleDateString('zh-CN')}
        />
      )}
    </div>
  );
}

/* ================================================================ */
/*  订阅 — read-only + modal-driven lifecycle actions                 */
/* ================================================================ */

function SubscriptionCard({
  tenant,
  onIssue,
  onModify,
  onRenew,
  onRevoke,
}: {
  tenant: TenantDetailData;
  onIssue: () => void;
  onModify: () => void;
  onRenew: () => void;
  onRevoke: () => void;
}) {
  const ls = LICENSE_STATUS_LABELS[tenant.license.status];
  const tierLabel = tenant.license.tier ? TIER_LABELS[tenant.license.tier as OrgTier] : '-';
  const noLicense = tenant.license.status === 'none' || tenant.license.status === 'expired';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">订阅</h3>
      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
        <InfoRow label="许可状态" value={ls.label} />
        <InfoRow label="套餐等级" value={tierLabel} />
        <InfoRow label="席位上限" value={tenant.license.maxSeats ? String(tenant.license.maxSeats) : '-'} />
        <InfoRow label="已用席位" value={String(tenant.members.length)} />
        <InfoRow
          label="签发时间"
          value={tenant.license.issuedAt ? new Date(tenant.license.issuedAt).toLocaleDateString('zh-CN') : '-'}
        />
        <InfoRow
          label="到期时间"
          value={tenant.license.expiresAt ? new Date(tenant.license.expiresAt).toLocaleDateString('zh-CN') : '-'}
        />
      </div>
      <div className="flex gap-3 mt-5">
        {noLicense ? (
          <button onClick={onIssue} className="flex items-center gap-1.5 text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">
            <CreditCard className="w-4 h-4" /> 签发许可证
          </button>
        ) : (
          <>
            <button onClick={onModify} className="flex items-center gap-1.5 text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">
              <Edit2 className="w-4 h-4" /> 修改套餐
            </button>
            <button onClick={onRenew} className="flex items-center gap-1.5 text-sm bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600">
              <RefreshCw className="w-4 h-4" /> 续期 12 个月
            </button>
            <button onClick={onRevoke} className="flex items-center gap-1.5 text-sm bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100">
              <Ban className="w-4 h-4" /> 撤销许可证
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ================================================================ */
/*  AI 服务                                                            */
/* ================================================================ */

function AiServiceCard({
  config,
  onSave,
}: {
  config: ServiceConfig['aiConfig'];
  onSave: (next: ServiceConfig['aiConfig']) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(config);

  function startEdit() {
    setDraft(config);
    setEditing(true);
  }
  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      /* surfaced upstream */
    } finally {
      setSaving(false);
    }
  }

  return (
    <CardShell
      title="AI 服务"
      editing={editing}
      saving={saving}
      onStartEdit={startEdit}
      onCancel={() => setEditing(false)}
      onSave={handleSave}
    >
      <div className="grid grid-cols-2 gap-4">
        <ServiceField label="API Key" value={draft.apiKey} field="aiConfig.apiKey" editing={editing} type="password"
          onChange={(v) => setDraft((s) => ({ ...s, apiKey: v }))} />
        <ServiceField label="Base URL" value={draft.baseUrl} field="aiConfig.baseUrl" editing={editing}
          onChange={(v) => setDraft((s) => ({ ...s, baseUrl: v }))} />
        <ServiceField label="模型" value={draft.model} field="aiConfig.model" editing={editing}
          onChange={(v) => setDraft((s) => ({ ...s, model: v }))} />
        <ServiceField label="月 Token 限额" value={String(draft.monthlyTokenLimit || '')} field="aiConfig.monthlyTokenLimit" editing={editing} type="number"
          onChange={(v) => setDraft((s) => ({ ...s, monthlyTokenLimit: parseInt(v) || 0 }))} />
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/*  邮件服务                                                           */
/* ================================================================ */

function EmailServiceCard({
  config,
  onSave,
}: {
  config: ServiceConfig['emailConfig'];
  onSave: (next: ServiceConfig['emailConfig']) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(config);

  function startEdit() {
    setDraft(config);
    setEditing(true);
  }
  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      /* surfaced upstream */
    } finally {
      setSaving(false);
    }
  }

  return (
    <CardShell
      title="邮件服务"
      editing={editing}
      saving={saving}
      onStartEdit={startEdit}
      onCancel={() => setEditing(false)}
      onSave={handleSave}
    >
      <div className="grid grid-cols-2 gap-4">
        <ServiceField label="SMTP 主机" value={draft.smtpHost} field="emailConfig.smtpHost" editing={editing}
          onChange={(v) => setDraft((s) => ({ ...s, smtpHost: v }))} />
        <ServiceField label="SMTP 端口" value={String(draft.smtpPort)} field="emailConfig.smtpPort" editing={editing} type="number"
          onChange={(v) => setDraft((s) => ({ ...s, smtpPort: parseInt(v) || 465 }))} />
        <ServiceField label="SMTP 用户" value={draft.smtpUser} field="emailConfig.smtpUser" editing={editing}
          onChange={(v) => setDraft((s) => ({ ...s, smtpUser: v }))} />
        <ServiceField label="SMTP 密码" value={draft.smtpPass} field="emailConfig.smtpPass" editing={editing} type="password"
          onChange={(v) => setDraft((s) => ({ ...s, smtpPass: v }))} />
        <ServiceField label="发件人名称" value={draft.senderName} field="emailConfig.senderName" editing={editing}
          onChange={(v) => setDraft((s) => ({ ...s, senderName: v }))} />
        <ServiceField label="发件人邮箱" value={draft.senderEmail} field="emailConfig.senderEmail" editing={editing}
          onChange={(v) => setDraft((s) => ({ ...s, senderEmail: v }))} />
      </div>
    </CardShell>
  );
}

/* ================================================================ */
/*  Shared card chrome — title bar + edit/save/cancel buttons        */
/* ================================================================ */

function CardShell({
  title,
  editing,
  saving,
  onStartEdit,
  onCancel,
  onSave,
  children,
}: {
  title: string;
  editing: boolean;
  saving: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={onCancel} className="text-sm text-slate-500 px-3 py-1.5">取消</button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1 text-sm bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        ) : (
          <button onClick={onStartEdit} className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700">
            <Edit2 className="w-3.5 h-3.5" />
            修改
          </button>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function EditableRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-500 shrink-0 w-20">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

const fieldInput =
  'w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200';

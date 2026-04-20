import { Edit2, Save } from 'lucide-react';
import { ServiceField } from './TenantDetailPrimitives';
import type { ServiceConfig } from './types';

/**
 * Services tab — AI + Email provider credentials. Read-only by default;
 * enters edit mode on "编辑" click, saved via a single PATCH on save.
 */
export function TenantServicesTab({
  serviceConfig,
  setServiceConfig,
  editing,
  saving,
  onStartEdit,
  onCancel,
  onSave,
}: {
  serviceConfig: ServiceConfig | null;
  setServiceConfig: (patcher: (s: ServiceConfig | null) => ServiceConfig | null) => void;
  editing: boolean;
  saving: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">增值服务配置</h3>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={onCancel} className="text-sm text-slate-500 px-3 py-1.5">取消</button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1 text-sm bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        ) : (
          <button onClick={onStartEdit} className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700">
            <Edit2 className="w-3.5 h-3.5" />
            编辑
          </button>
        )}
      </div>

      {!serviceConfig ? (
        <div className="text-sm text-slate-400 py-8 text-center">加载中...</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h4 className="text-sm font-semibold text-slate-700 mb-4">AI 服务</h4>
            <div className="grid grid-cols-2 gap-4">
              <ServiceField label="API Key" value={serviceConfig.aiConfig.apiKey} field="aiConfig.apiKey" editing={editing} type="password"
                onChange={(v) => setServiceConfig((s) => s ? { ...s, aiConfig: { ...s.aiConfig, apiKey: v } } : s)} />
              <ServiceField label="Base URL" value={serviceConfig.aiConfig.baseUrl} field="aiConfig.baseUrl" editing={editing}
                onChange={(v) => setServiceConfig((s) => s ? { ...s, aiConfig: { ...s.aiConfig, baseUrl: v } } : s)} />
              <ServiceField label="模型" value={serviceConfig.aiConfig.model} field="aiConfig.model" editing={editing}
                onChange={(v) => setServiceConfig((s) => s ? { ...s, aiConfig: { ...s.aiConfig, model: v } } : s)} />
              <ServiceField label="月 Token 限额" value={String(serviceConfig.aiConfig.monthlyTokenLimit || '')} field="aiConfig.monthlyTokenLimit" editing={editing} type="number"
                onChange={(v) => setServiceConfig((s) => s ? { ...s, aiConfig: { ...s.aiConfig, monthlyTokenLimit: parseInt(v) || 0 } } : s)} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h4 className="text-sm font-semibold text-slate-700 mb-4">邮件服务</h4>
            <div className="grid grid-cols-2 gap-4">
              <ServiceField label="SMTP 主机" value={serviceConfig.emailConfig.smtpHost} field="emailConfig.smtpHost" editing={editing}
                onChange={(v) => setServiceConfig((s) => s ? { ...s, emailConfig: { ...s.emailConfig, smtpHost: v } } : s)} />
              <ServiceField label="SMTP 端口" value={String(serviceConfig.emailConfig.smtpPort)} field="emailConfig.smtpPort" editing={editing} type="number"
                onChange={(v) => setServiceConfig((s) => s ? { ...s, emailConfig: { ...s.emailConfig, smtpPort: parseInt(v) || 465 } } : s)} />
              <ServiceField label="SMTP 用户" value={serviceConfig.emailConfig.smtpUser} field="emailConfig.smtpUser" editing={editing}
                onChange={(v) => setServiceConfig((s) => s ? { ...s, emailConfig: { ...s.emailConfig, smtpUser: v } } : s)} />
              <ServiceField label="SMTP 密码" value={serviceConfig.emailConfig.smtpPass} field="emailConfig.smtpPass" editing={editing} type="password"
                onChange={(v) => setServiceConfig((s) => s ? { ...s, emailConfig: { ...s.emailConfig, smtpPass: v } } : s)} />
              <ServiceField label="发件人名称" value={serviceConfig.emailConfig.senderName} field="emailConfig.senderName" editing={editing}
                onChange={(v) => setServiceConfig((s) => s ? { ...s, emailConfig: { ...s.emailConfig, senderName: v } } : s)} />
              <ServiceField label="发件人邮箱" value={serviceConfig.emailConfig.senderEmail} field="emailConfig.senderEmail" editing={editing}
                onChange={(v) => setServiceConfig((s) => s ? { ...s, emailConfig: { ...s.emailConfig, senderEmail: v } } : s)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

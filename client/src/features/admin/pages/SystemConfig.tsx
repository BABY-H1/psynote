import React, { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { Lock, Mail, Bot, Globe, RefreshCw } from 'lucide-react';

interface SystemConfigData {
  platform: { name: string; version: string };
  security: { accessTokenExpiry: string; refreshTokenExpiry: string; minPasswordLength: number };
  defaults: { orgPlan: string; maxMembersPerOrg: number };
  email: { configured: boolean; host: string };
  ai: { configured: boolean; model: string; baseUrl: string };
}

const PLAN_LABELS: Record<string, string> = { free: '免费版', pro: '专业版', enterprise: '企业版' };

export function SystemConfig() {
  const [config, setConfig] = useState<SystemConfigData | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400">加载中...</div>;
  if (!config) return <div className="flex items-center justify-center py-20 text-slate-400">加载失败</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">系统配置</h2>
        <button onClick={loadConfig} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
          <RefreshCw className="w-3.5 h-3.5" /> 刷新
        </button>
      </div>

      {/* Platform */}
      <ConfigSection icon={<Globe className="w-4 h-4 text-blue-500" />} title="平台信息">
        <ConfigRow label="平台名称" value={config.platform.name} />
        <ConfigRow label="版本" value={config.platform.version} />
      </ConfigSection>

      {/* Security */}
      <ConfigSection icon={<Lock className="w-4 h-4 text-amber-500" />} title="安全策略">
        <ConfigRow label="Access Token 有效期" value={config.security.accessTokenExpiry} />
        <ConfigRow label="Refresh Token 有效期" value={config.security.refreshTokenExpiry} />
        <ConfigRow label="最小密码长度" value={`${config.security.minPasswordLength} 位`} />
        <p className="text-xs text-slate-400 mt-2 px-4">安全策略修改需要更新服务端环境变量并重启服务。</p>
      </ConfigSection>

      {/* Defaults */}
      <ConfigSection icon={<Globe className="w-4 h-4 text-green-500" />} title="默认设置">
        <ConfigRow label="新机构默认套餐" value={PLAN_LABELS[config.defaults.orgPlan] || config.defaults.orgPlan} />
        <ConfigRow label="每机构最大成员数" value={`${config.defaults.maxMembersPerOrg} 人`} />
      </ConfigSection>

      {/* Email */}
      <ConfigSection icon={<Mail className="w-4 h-4 text-purple-500" />} title="邮件服务">
        <ConfigRow
          label="配置状态"
          value={config.email.configured ? '已配置' : '未配置'}
          valueClass={config.email.configured ? 'text-green-600' : 'text-orange-500'}
        />
        <ConfigRow label="SMTP 服务器" value={config.email.host} />
        {!config.email.configured && (
          <p className="text-xs text-orange-400 mt-2 px-4">邮件服务未配置，预约提醒等邮件功能将无法使用。请在 .env 中配置 SMTP 相关参数。</p>
        )}
      </ConfigSection>

      {/* AI */}
      <ConfigSection icon={<Bot className="w-4 h-4 text-indigo-500" />} title="AI 服务">
        <ConfigRow
          label="配置状态"
          value={config.ai.configured ? '已配置' : '未配置'}
          valueClass={config.ai.configured ? 'text-green-600' : 'text-orange-500'}
        />
        <ConfigRow label="模型" value={config.ai.model} />
        <ConfigRow label="API 地址" value={config.ai.baseUrl} />
      </ConfigSection>
    </div>
  );
}

function ConfigSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
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

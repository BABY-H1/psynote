import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { useToast } from '../../../shared/components';
import { Bell, Save } from 'lucide-react';

function orgPrefix() {
  const orgId = useAuthStore.getState().currentOrgId;
  return `/orgs/${orgId}`;
}

export function ReminderSettings() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['reminderSettings', orgId],
    queryFn: () => api.get<any>(`${orgPrefix()}/reminder-settings`),
    enabled: !!orgId,
  });

  const updateSettings = useMutation({
    mutationFn: (data: any) => api.put(`${orgPrefix()}/reminder-settings`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminderSettings'] });
      toast('设置已保存', 'success');
    },
  });

  const [enabled, setEnabled] = useState(true);
  const [remind24h, setRemind24h] = useState(true);
  const [remind1h, setRemind1h] = useState(true);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('465');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled ?? true);
      const rb = (settings.remindBefore as number[]) || [1440, 60];
      setRemind24h(rb.includes(1440));
      setRemind1h(rb.includes(60));
      const ec = (settings.emailConfig as any) || {};
      setSmtpHost(ec.host || '');
      setSmtpPort(String(ec.port || 465));
      setSmtpUser(ec.user || '');
      setSmtpPass(ec.pass || '');
      const mt = (settings.messageTemplate as any) || {};
      setSubject(mt.subject || '');
      setBody(mt.body || '');
    }
  }, [settings]);

  const handleSave = () => {
    const remindBefore: number[] = [];
    if (remind24h) remindBefore.push(1440);
    if (remind1h) remindBefore.push(60);

    updateSettings.mutate({
      enabled,
      channels: ['email'],
      remindBefore,
      emailConfig: { host: smtpHost || undefined, port: Number(smtpPort), user: smtpUser || undefined, pass: smtpPass || undefined },
      messageTemplate: { subject: subject || undefined, body: body || undefined },
    });
  };

  if (isLoading) return <div className="text-sm text-slate-400 py-8 text-center">加载中...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Bell className="w-5 h-5" /> 预约提醒设置
        </h1>
        <p className="text-sm text-slate-500 mt-1">配置自动预约提醒，减少爽约率</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        {/* Enable/disable */}
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded text-brand-600" />
          <span className="text-sm text-slate-700 font-medium">启用自动提醒</span>
        </label>

        {/* Timing */}
        <div>
          <div className="text-xs text-slate-500 font-medium mb-2">提醒时间</div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={remind24h} onChange={(e) => setRemind24h(e.target.checked)} className="rounded text-brand-600" />
              <span className="text-sm text-slate-600">预约前 24 小时</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={remind1h} onChange={(e) => setRemind1h(e.target.checked)} className="rounded text-brand-600" />
              <span className="text-sm text-slate-600">预约前 1 小时</span>
            </label>
          </div>
        </div>

        {/* SMTP Config */}
        <div>
          <div className="text-xs text-slate-500 font-medium mb-2">邮件服务器 (SMTP)</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">服务器地址</label>
              <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">端口</label>
              <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="465"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">用户名/邮箱</label>
              <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="noreply@example.com"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">密码/授权码</label>
              <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="••••••••"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </div>
          </div>
        </div>

        {/* Message Template */}
        <div>
          <div className="text-xs text-slate-500 font-medium mb-2">消息模板</div>
          <p className="text-xs text-slate-400 mb-2">可用变量：{'{clientName}'} {'{counselorName}'} {'{time}'} {'{confirmLink}'} {'{cancelLink}'}</p>
          <div className="space-y-2">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="邮件主题（留空使用默认）"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="邮件内容（留空使用默认模板）"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={handleSave} disabled={updateSettings.isPending}
            className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-2">
            <Save className="w-4 h-4" /> {updateSettings.isPending ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}

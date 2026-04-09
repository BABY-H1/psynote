import React from 'react';
import { useAuthStore } from '@client/stores/authStore';
import { User as UserIcon, Mail, BadgeCheck } from 'lucide-react';

/**
 * Phase 8c — ProfileSettings: drill-down from AccountTab → "个人信息".
 *
 * Phase 8c v1 is READ-ONLY. The portal doesn't have a `/client/profile`
 * PATCH endpoint, so surfacing an editable form here would be premature.
 * When the backend adds profile edit endpoints, this file is the single
 * place to flip to an editable form + mutation hook.
 *
 * Shown fields (all from authStore.user):
 *   - Name
 *   - Email
 *   - Account ID (short, for support)
 */
export function ProfileSettings() {
  const { user } = useAuthStore();

  if (!user) {
    return (
      <div className="text-center py-12 text-sm text-slate-400">未登录</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center py-6">
        <div className="w-20 h-20 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-3xl font-bold mx-auto">
          {user.name?.charAt(0) || 'U'}
        </div>
        <div className="text-lg font-semibold text-slate-900 mt-3">{user.name}</div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
        <InfoRow icon={<UserIcon className="w-4 h-4" />} label="姓名" value={user.name || '-'} />
        <InfoRow
          icon={<Mail className="w-4 h-4" />}
          label="邮箱"
          value={user.email || '未绑定'}
        />
        <InfoRow
          icon={<BadgeCheck className="w-4 h-4" />}
          label="账户 ID"
          value={user.id ? user.id.slice(0, 8) + '…' : '-'}
          mono
        />
      </div>

      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
        <div className="text-xs text-slate-500">
          个人信息编辑功能即将上线
        </div>
        <div className="text-[10px] text-slate-400 mt-1">
          如需修改，请联系您的咨询师或机构管理员
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</div>
        <div
          className={`text-sm text-slate-900 truncate ${mono ? 'font-mono' : ''}`}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

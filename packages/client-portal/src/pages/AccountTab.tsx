import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User as UserIcon, FileCheck, Settings, LogOut, ChevronRight, Mail } from 'lucide-react';
import { useAuthStore } from '@client/stores/authStore';
import { useMyDocuments } from '@client/api/useConsent';

/**
 * Phase 8c — AccountTab: "我的" tab.
 *
 * Layout:
 *   [Avatar card]  Big card with user's name, email, maybe avatar
 *   ──────────────
 *   [Link row]     个人信息       → /portal/account/profile
 *   [Link row]     协议与授权  (2) → /portal/account/consents (count from pending docs)
 *   [Link row]     设置           → /portal/account/settings (future)
 *   ──────────────
 *   [Logout]       退出登录       → logout() + navigate('/login')
 *
 * Intentionally simple: this is the "destination" tab, not a dashboard.
 * Everything below the avatar card is a list of navigation rows following
 * the iOS/Android settings-screen idiom. Each row is full-width, tall
 * enough for touch targets, with a chevron on the right to signal drill-down.
 */
export function AccountTab() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { data: myDocs } = useMyDocuments();
  const pendingCount = (myDocs ?? []).filter((d) => d.status === 'pending').length;

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="space-y-4">
      {/* Identity card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xl font-bold flex-shrink-0">
          {user?.name?.charAt(0) || 'U'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-slate-900 truncate">
            {user?.name || '未登录'}
          </div>
          {user?.email && (
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {user.email}
            </div>
          )}
        </div>
      </div>

      {/* Navigation rows */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
        <AccountRow
          icon={<UserIcon className="w-5 h-5 text-brand-600" />}
          iconBg="bg-brand-50"
          label="个人信息"
          onClick={() => navigate('/portal/account/profile')}
        />
        <AccountRow
          icon={<FileCheck className="w-5 h-5 text-amber-600" />}
          iconBg="bg-amber-50"
          label="协议与授权"
          badge={pendingCount > 0 ? String(pendingCount) : undefined}
          onClick={() => navigate('/portal/account/consents')}
        />
        <AccountRow
          icon={<Settings className="w-5 h-5 text-slate-500" />}
          iconBg="bg-slate-100"
          label="设置"
          disabled
          hint="即将上线"
        />
      </div>

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-center gap-2 text-sm font-semibold text-rose-600 active:scale-[0.99] hover:border-rose-200 transition"
      >
        <LogOut className="w-4 h-4" />
        退出登录
      </button>

      <div className="text-center text-[10px] text-slate-400 py-4">
        Psynote · 来访者服务门户
      </div>
    </div>
  );
}

function AccountRow({
  icon,
  iconBg,
  label,
  badge,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  badge?: string;
  hint?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const Comp: any = disabled || !onClick ? 'div' : 'button';
  return (
    <Comp
      type={disabled || !onClick ? undefined : 'button'}
      onClick={disabled ? undefined : onClick}
      className={`w-full flex items-center gap-3 p-4 text-left transition ${
        disabled ? 'opacity-60' : 'hover:bg-slate-50'
      }`}
    >
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-900">{label}</span>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
            {badge}
          </span>
        )}
      </div>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
      {!disabled && onClick && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
    </Comp>
  );
}

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User as UserIcon, FileCheck, Settings, LogOut, ChevronRight, Mail,
  Building2, Users, Plus,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@client/stores/authStore';
import { useMyDocuments } from '@client/api/useConsent';
import { api } from '@client/api/client';
import { PARENT_RELATION_LABELS } from '@psynote/shared';
import { useMyChildren } from '../api/useFamily';

/**
 * AccountTab — "我的" tab.
 *
 * 用户反馈：以前点进"我的孩子"才能看关系，这是多余一次跳转。现在 AccountTab
 * 把"所属机构 + 绑定的孩子"直接 inline 展示，用户一眼就知道自己当前是谁、
 * 为谁看。
 */
export function AccountTab() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { data: myDocs } = useMyDocuments();
  const { data: children } = useMyChildren();
  const { data: orgs } = useMyOrgs();
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

      {/* 我的归属 */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-semibold text-slate-600 tracking-wide">所属机构</span>
        </div>
        <div className="divide-y divide-slate-100">
          {(orgs ?? []).length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-400">暂无机构</div>
          ) : (
            (orgs ?? []).map((o) => (
              <div key={o.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{o.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">角色：{roleLabel(o.myRole)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 我的孩子 */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600 tracking-wide">绑定的孩子</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/portal/account/children')}
            className="text-xs text-brand-600 font-medium flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" />
            绑定/管理
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {(children ?? []).length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-400">
              还未绑定任何孩子 · 点击右上角可以开始绑定
            </div>
          ) : (
            (children ?? []).map((c) => (
              <button
                key={c.relationshipId}
                type="button"
                onClick={() => navigate('/portal/account/children')}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0 text-sm font-bold">
                  {c.childName?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{c.childName}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {PARENT_RELATION_LABELS[c.relation]}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* 导航入口 */}
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

function roleLabel(role: string): string {
  switch (role) {
    case 'client': return '来访者';
    case 'counselor': return '咨询师';
    case 'org_admin': return '机构管理员';
    case 'supervisor': return '督导';
    default: return role;
  }
}

function useMyOrgs() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['myOrgs', user?.id ?? null],
    queryFn: () => api.get<Array<{ id: string; name: string; myRole: string }>>('/orgs'),
    enabled: !!user,
  });
}

function AccountRow({
  icon, iconBg, label, badge, hint, onClick, disabled,
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

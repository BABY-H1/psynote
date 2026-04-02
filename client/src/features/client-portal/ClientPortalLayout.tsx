import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const clientNav = [
  { to: '/portal', label: '健康概览', end: true },
  { to: '/portal/services', label: '服务大厅' },
  { to: '/portal/appointments', label: '我的预约' },
];

export function ClientPortalLayout() {
  const { user, logout } = useAuthStore();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top nav bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-lg font-bold text-brand-600">Psynote</h1>
          </div>
          <nav className="flex gap-1">
            {clientNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item && item.end}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">{user?.name}</span>
          <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600">
            退出
          </button>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

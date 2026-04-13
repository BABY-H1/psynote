import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { BarChart3, Users, Building2, AlertTriangle, Settings, LogOut } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/hr', label: '数据概览', icon: BarChart3, end: true },
  { to: '/hr/employees', label: '员工管理', icon: Users },
  { to: '/hr/providers', label: '合作机构', icon: Building2 },
  { to: '/hr/crisis', label: '危机预警', icon: AlertTriangle },
  { to: '/hr/settings', label: '企业设置', icon: Settings },
];

export function HRDashboardShell() {
  const { user, currentRole, logout } = useAuthStore();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <h1 className="text-lg font-bold text-amber-600">EAP 管理</h1>
          <p className="text-xs text-slate-400 mt-0.5">员工心理援助平台</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-amber-50 text-amber-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-100">
          <div className="text-sm text-slate-700 font-medium truncate">{user?.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
              {(currentRole as string) === 'hr_admin' ? 'HR' : '管理员'}
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 ml-auto"
            >
              <LogOut className="w-3 h-3" />
              退出
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

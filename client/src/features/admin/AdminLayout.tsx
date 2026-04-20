import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import {
  LayoutDashboard,
  Building2,
  BookOpen,
  Users,
  Settings,
  Shield,
  LogOut,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: '首页', icon: LayoutDashboard },
  { to: '/admin/tenants', label: '租户管理', icon: Building2 },
  { to: '/admin/library', label: '知识库', icon: BookOpen },
  { to: '/admin/users', label: '账号管理', icon: Users },
  { to: '/admin/settings', label: '系统设置', icon: Settings },
];

export function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    // Match AppShell: lock outer to viewport height so the sidebar stays
    // fixed and only <main> scrolls. Without this the whole page would
    // scroll together and any `sticky` inside sub-pages would lose its
    // frame of reference.
    <div className="h-screen bg-slate-50 flex overflow-hidden">
      {/* Sidebar — flex-shrink-0 keeps the 240px width; inner overflow-y-auto
          lets a very long nav list scroll independently too. */}
      <aside className="w-60 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 overflow-y-auto">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Psynote</h1>
              <p className="text-xs text-red-500 font-medium">系统管理</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-red-50 text-red-700'
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
            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
              系统管理员
            </span>
            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-slate-600 ml-auto flex items-center gap-1"
            >
              <LogOut className="w-3 h-3" />
              退出
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';

const TABS = [
  { to: '/admin/library/scales', label: '量表' },
  { to: '/admin/library/courses', label: '课程模板' },
  { to: '/admin/library/schemes', label: '团辅方案' },
  { to: '/admin/library/templates', label: '记录模板' },
  { to: '/admin/library/goals', label: '目标库' },
];

export function AdminLibrary() {
  const { pathname } = useLocation();

  // Redirect bare /admin/library to first tab
  if (pathname === '/admin/library') {
    return <Navigate to="/admin/library/scales" replace />;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">知识库</h1>
        <p className="text-sm text-slate-500 mt-1">管理系统级内容模板，可分发给租户使用</p>
      </div>

      {/* Pill tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-6">
        {TABS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-4 py-1.5 text-sm font-medium rounded-md transition ${
                isActive
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}

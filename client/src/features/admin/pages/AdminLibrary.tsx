import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';

/**
 * Tab list mirrors `client/src/features/knowledge/pages/KnowledgeBase.tsx`
 * exactly — order + labels. System admin and org users share the underlying
 * library components; the only difference is the API scope, resolved at
 * hook level via `libraryApi()`.
 */
const TABS = [
  { to: '/admin/library/scales', label: '测评量表' },
  { to: '/admin/library/goals', label: '干预目标' },
  { to: '/admin/library/agreements', label: '合规协议' },
  { to: '/admin/library/schemes', label: '团辅方案' },
  { to: '/admin/library/courses', label: '课程教学' },
  { to: '/admin/library/templates', label: '会谈记录' },
];

export function AdminLibrary() {
  const { pathname } = useLocation();

  // Redirect bare /admin/library to the first tab (scales).
  if (pathname === '/admin/library') {
    return <Navigate to="/admin/library/scales" replace />;
  }

  return (
    // Flex-column layout lets detail pages (see `GoalDetail.tsx`,
    // `AgreementDetail.tsx` etc.) use `h-full` to fit the viewport
    // without hardcoding `calc(100vh - Nrem)` magic numbers that go
    // stale when this chrome changes.
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto w-full">
      {/* Page title removed — the left sidebar already labels the page
          "知识库". Subtitle kept because it's unique content (a
          one-liner explaining what this page does). */}
      <p className="text-sm text-slate-500 mb-3 flex-shrink-0">
        管理平台级内容模板，创建后可分发给租户使用
      </p>

      {/* Pill tabs — matches client/src/features/knowledge/pages/KnowledgeBase.tsx */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-shrink-0 mb-4 w-fit">
        {TABS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
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

      {/* `min-h-0` is required so `flex-1` can actually shrink below content
          size — without it, tall child content makes this container grow
          past viewport. `overflow-y-auto` is for list views (content
          overflows, wrapper scrolls); detail views with `h-full` fit
          exactly and scroll internally in their own panes. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}

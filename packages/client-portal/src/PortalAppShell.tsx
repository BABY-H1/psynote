import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useAuthStore } from '@client/stores/authStore';
import { BottomTabBar } from './components/BottomTabBar';

/**
 * Phase 8c — Mobile-first portal shell.
 *
 * Layout contract:
 *
 *   ┌────── max-w-md centered ──────┐
 *   │  header (sticky, 56px)        │  ← back button (on drill-down) or logo
 *   ├───────────────────────────────┤
 *   │                               │
 *   │  <Outlet />  (flex-1, scroll) │  ← scrollable content
 *   │                               │
 *   ├───────────────────────────────┤
 *   │  BottomTabBar (flex child)    │  ← 4 tabs, from components/BottomTabBar
 *   └───────────────────────────────┘
 *
 * The shell is a `min-h-screen flex flex-col`:
 *   - header is `sticky top-0`
 *   - main is `flex-1 overflow-y-auto`
 *   - BottomTabBar is the last flex child (`flex-shrink-0`)
 * This way the tab bar reliably sits at the bottom of the phone shell on
 * every viewport, with no `position: fixed` containing-block hazards.
 *
 * On desktop (viewport > max-w-md), the shell is centered horizontally with
 * slate-100 gutters on both sides — making the portal look like a phone
 * mockup when viewed at full-width. This is intentional: Phase 8c's design
 * decision is to NOT build two layouts. The same single-column layout runs
 * on mobile, tablet, and desktop, minimizing the cost of a future Taro
 * compile to WeChat Mini Program.
 *
 * Header behavior:
 * - On tab root routes (/portal, /portal/services, /portal/archive, /portal/account):
 *   show the org name / 'Psynote Portal' text + logout icon.
 * - On drill-down routes (/portal/services/:id, /portal/account/profile, etc.):
 *   show a back button + a context-aware title.
 *
 * The isRootRoute check is a simple pathname match. We intentionally keep it
 * stupid: if you need more sophisticated headers per route, push a title via
 * Context or route handle — but for Phase 8c the simple version is enough.
 */

const ROOT_PATHS = new Set([
  '/portal',
  '/portal/',
  '/portal/services',
  '/portal/archive',
  '/portal/account',
]);

export function PortalAppShell() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isRootRoute = ROOT_PATHS.has(location.pathname);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="h-[100dvh] bg-slate-100 flex justify-center overflow-hidden">
      {/* Phone-shaped container — uses `100dvh` (dynamic viewport height)
          instead of `100vh` so iOS Safari / Android Chrome don't hide the
          bottom tab bar behind the browser URL bar. The inner flex column
          is exactly the visible viewport height, letting <main>'s
          overflow-y-auto scroll internally and pinning the tab bar to the
          visible bottom of the shell on every device. */}
      <div className="w-full max-w-md h-full bg-slate-50 flex flex-col relative shadow-sm">
        {/* Sticky header */}
        <header className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm h-14 flex items-center px-4 border-b border-slate-200">
          {isRootRoute ? (
            <>
              <div className="flex-1 flex items-center gap-2">
                <span className="text-base font-bold text-brand-600">Psynote</span>
                <span className="text-xs text-slate-400">来访者服务</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 -mr-2 text-slate-400 hover:text-slate-600 transition"
                aria-label="退出登录"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="p-2 -ml-2 text-slate-500 hover:text-slate-700 transition"
                aria-label="返回"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 text-center text-sm font-semibold text-slate-900 truncate px-2">
                {user?.name || 'Psynote'}
              </div>
              {/* Spacer to balance the back button */}
              <div className="w-9" />
            </>
          )}
        </header>

        {/* Scrollable content area — flex-1 makes it consume all space
            between header and the (structural) tab bar below. */}
        <main className="flex-1 overflow-y-auto px-4 py-4">
          <Outlet />
        </main>

        {/* Bottom tab bar — last flex child, sits at the bottom of the
            phone shell on every viewport (no fixed positioning). */}
        <BottomTabBar />
      </div>
    </div>
  );
}

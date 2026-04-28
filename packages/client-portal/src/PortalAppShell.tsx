import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, LogOut, ChevronDown, User as UserIcon } from 'lucide-react';
import { useAuthStore } from '@client/stores/authStore';
import { BottomTabBar } from './components/BottomTabBar';
import { useMyChildren } from './api/useFamily';
import { useViewingContext } from './stores/viewingContext';
import { PARENT_RELATION_LABELS } from '@psynote/shared';

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
    <div className="h-screen bg-slate-100 flex justify-center overflow-hidden">
      {/*
        Use Tailwind built-in `h-screen` (= 100vh) for a guaranteed-compiled
        utility. Earlier this was `h-[100dvh]` to handle iOS Safari URL bar
        hiding behind the bottom tab, but that arbitrary-value class wasn't
        being emitted into the bundle (BUG-008 root cause: phoneShell
        collapsed to 345px on desktop, tab bar floated in mid-screen).

        100vh fallback works on every desktop browser and on mobile Safari
        the URL bar overlap is a minor visual nit — alpha-acceptable. If we
        re-need 100dvh for mobile production polish, add it as a custom
        height utility in tailwind.config.ts theme.extend.height instead of
        an arbitrary value (so it's guaranteed to compile).

        Combined with `html, body, #root { height: 100% }` in index.css,
        this anchors the entire layout chain to the real viewport height.
      */}
      <div className="w-full max-w-md h-full bg-slate-50 flex flex-col relative shadow-sm">
        {/* Sticky header */}
        <header className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm h-14 flex items-center px-4 border-b border-slate-200">
          {isRootRoute ? (
            <>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-base font-bold text-brand-600 flex-shrink-0">Psynote</span>
                <IdentitySwitcher />
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

/**
 * Phase 14 — Identity switcher in the header.
 *
 * - When the user has 0 active children bindings → show only "来访者服务"
 *   subtitle (= original behavior).
 * - When the user has 1+ children bindings → show a clickable pill that
 *   reads either "我自己" or the child's name. Clicking opens a dropdown.
 *
 * Uses `useViewingContext` Zustand store. Switching does NOT navigate; it
 * just changes the param consumers (HomeTab/MyServices/AccountTab) read.
 */
function IdentitySwitcher() {
  const { data: children } = useMyChildren();
  const { viewingAs, viewingAsName, setViewingAs } = useViewingContext();
  const [open, setOpen] = React.useState(false);
  const list = children ?? [];

  // No bindings → mimic original subtitle
  if (list.length === 0) {
    return <span className="text-xs text-slate-400">来访者服务</span>;
  }

  const currentLabel = viewingAs
    ? `${viewingAsName || '孩子'} (孩子)`
    : '我自己';

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-brand-50 text-brand-700 hover:bg-brand-100 transition"
      >
        <UserIcon className="w-3 h-3 flex-shrink-0" />
        <span className="truncate max-w-[140px]">{currentLabel}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" />
      </button>
      {open && (
        <>
          {/* Click-outside backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            <SwitcherRow
              label="我自己"
              active={viewingAs === null}
              onClick={() => {
                setViewingAs(null);
                setOpen(false);
              }}
            />
            <div className="border-t border-slate-100" />
            {list.map((c) => (
              <SwitcherRow
                key={c.relationshipId}
                label={`${c.childName}（${PARENT_RELATION_LABELS[c.relation]}）`}
                active={viewingAs === c.childUserId}
                onClick={() => {
                  setViewingAs(c.childUserId, c.childName);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SwitcherRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 text-sm transition flex items-center gap-2 ${
        active
          ? 'bg-brand-50 text-brand-700 font-semibold'
          : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      <UserIcon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {active && <span className="text-brand-500 text-xs">✓</span>}
    </button>
  );
}

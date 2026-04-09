import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Clipboard, Folder, User } from 'lucide-react';

/**
 * Phase 8c — Bottom tab bar for the mobile-first portal shell.
 *
 * Four tabs that mirror the new information architecture:
 *   🏠 首页     — HomeTab   (待办 + 当前状态 + 时间线缩略)
 *   📋 我的服务 — MyServicesTab (咨询 + 团辅 + 课程)
 *   📁 档案     — ArchiveTab (测评历史 + 完整时间线)
 *   👤 我的     — AccountTab (协议 + 个人信息 + 退出)
 *
 * Design notes:
 * - Rendered as the **last flex child** of PortalAppShell's inner column,
 *   not a `fixed` overlay. This means:
 *     1. The tab bar sits at the visual bottom of the phone shell on every
 *        viewport size — no `fixed` containing-block surprises.
 *     2. Content above gets `flex-1 overflow-y-auto`, so it scrolls
 *        independently of the tab bar without needing `pb-24` workarounds.
 *     3. The layout is structural (not an overlay), which matches WeChat
 *        Mini Program's native tab bar model and lets Taro compile it
 *        without JS runtime fixes.
 * - `pb-[env(safe-area-inset-bottom)]` pushes the bar above the iPhone
 *   home indicator on notched devices. On other browsers it resolves to 0.
 * - Each tab is ≥ 44 × 44 px for iOS HIG touch target compliance.
 * - NavLink gives us the `isActive` prop so the icon/label switch to the
 *   brand color when the current route matches.
 */

interface TabDef {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** `end` forces exact matching; used for the root tab (/portal) so it isn't
   *  perpetually active when a sibling route is mounted. */
  end?: boolean;
}

const TABS: TabDef[] = [
  { to: '/portal', label: '首页', icon: Home, end: true },
  { to: '/portal/services', label: '我的服务', icon: Clipboard },
  { to: '/portal/archive', label: '档案', icon: Folder },
  { to: '/portal/account', label: '我的', icon: User },
];

export function BottomTabBar() {
  return (
    <nav
      className="flex-shrink-0 w-full bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
      aria-label="主导航"
    >
      <ul className="flex items-stretch h-16">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `h-full flex flex-col items-center justify-center gap-0.5 text-[10px] transition ${
                  isActive
                    ? 'text-brand-600'
                    : 'text-slate-400 hover:text-slate-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon
                    className={`w-6 h-6 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`}
                  />
                  <span className={isActive ? 'font-semibold' : ''}>{tab.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

import React, { useState } from 'react';
import { Outlet, NavLink, useLocation, Navigate } from 'react-router-dom';

const tabs = [
  { to: '/knowledge/scales', label: '测评量表' },
  { to: '/knowledge/goals', label: '干预目标' },
  { to: '/knowledge/agreements', label: '合规协议' },
  { to: '/knowledge/schemes', label: '团辅方案' },
  { to: '/knowledge/courses', label: '课程教学' },
  { to: '/knowledge/templates', label: '会谈记录' },
];

export function KnowledgeBase() {
  const location = useLocation();
  // Historical override for the courses tab lived here; since the tab list
  // now reads "课程教学" directly, no runtime renaming is needed.
  const displayTabs = tabs;

  // Redirect /knowledge to /knowledge/scales
  if (location.pathname === '/knowledge') {
    return <Navigate to="/knowledge/scales" replace />;
  }

  return (
    // Flex-column layout lets detail pages (ScaleDetail / AgreementDetail /
    // SchemeDetail / GoalDetail / NoteTemplateDetail) use `h-full` and
    // fit the viewport without hardcoding `calc(100vh - Nrem)`.
    <div className="h-full flex flex-col">
      {/* Sub tabs — pill style */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-shrink-0 mb-4 w-fit">
        {displayTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium transition ${
                isActive
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* `min-h-0` lets `flex-1` shrink below intrinsic content size;
          `overflow-y-auto` is for list views (tall content scrolls
          here), while detail views use `h-full` and fit exactly. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Outlet, NavLink, useLocation, Navigate } from 'react-router-dom';

const tabs = [
  { to: '/knowledge/scales', label: '测评量表' },
  { to: '/knowledge/goals', label: '治疗目标' },
  { to: '/knowledge/agreements', label: '合规协议' },
  { to: '/knowledge/schemes', label: '团辅方案' },
  { to: '/knowledge/courses', label: '课程方案' },
  { to: '/knowledge/templates', label: '会谈记录' },
];

export function KnowledgeBase() {
  const location = useLocation();
  const displayTabs = tabs.map((tab) =>
    tab.to === '/knowledge/courses'
      ? { ...tab, label: '课程工作室' }
      : tab,
  );

  // Redirect /knowledge to /knowledge/scales
  if (location.pathname === '/knowledge') {
    return <Navigate to="/knowledge/scales" replace />;
  }

  return (
    <div className="space-y-4">
      {/* Sub tabs — pill style */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
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

      {/* Content */}
      <Outlet />
    </div>
  );
}

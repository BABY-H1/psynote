import React, { useState } from 'react';
import { Outlet, NavLink, useLocation, Navigate } from 'react-router-dom';

const tabs = [
  { to: '/knowledge/scales', label: '量表' },
  { to: '/knowledge/goals', label: '治疗目标库' },
  { to: '/knowledge/agreements', label: '协议库' },
  { to: '/knowledge/schemes', label: '团辅方案' },
  { to: '/knowledge/courses', label: '课程模板' },
  { to: '/knowledge/templates', label: '文档模板' },
];

export function KnowledgeBase() {
  const location = useLocation();

  // Redirect /knowledge to /knowledge/scales
  if (location.pathname === '/knowledge') {
    return <Navigate to="/knowledge/scales" replace />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">知识库</h1>
        <p className="text-sm text-slate-500 mt-1">量表、治疗目标、方案模板等专业资源</p>
      </div>

      {/* Sub tabs */}
      <div className="flex gap-1 border-b border-slate-200 pb-0">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium border-b-2 transition ${
                isActive
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
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

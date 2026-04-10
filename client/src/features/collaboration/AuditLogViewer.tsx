/**
 * Phase 9ε — Audit Log Viewer (org_admin only).
 *
 * Two stacked tables:
 *   1. audit_logs    — every CRUD action
 *   2. phi_access_logs — every PHI view/export/print/share
 *
 * Filters: user / resource / action / time range. No charts, no export
 * (deferred per Phase 9 plan: minimum viable).
 */
import React, { useState } from 'react';
import { Filter } from 'lucide-react';
import { useAuditQuery, usePhiAccessQuery } from '../../api/useCollaboration';

export function AuditLogViewer() {
  const [tab, setTab] = useState<'audit' | 'phi'>('audit');
  const [filters, setFilters] = useState({
    userId: '',
    resource: '',
    action: '',
    since: '',
    until: '',
  });

  const audit = useAuditQuery({
    userId: filters.userId || undefined,
    resource: filters.resource || undefined,
    action: filters.action || undefined,
    since: filters.since || undefined,
    until: filters.until || undefined,
  });

  const phi = usePhiAccessQuery({
    userId: filters.userId || undefined,
    since: filters.since || undefined,
    until: filters.until || undefined,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">审计查询</h1>
        <p className="text-sm text-slate-500 mt-1">操作日志与 PHI 访问记录</p>
      </div>

      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === 'audit' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500'
          }`}
        >
          操作日志
        </button>
        <button
          type="button"
          onClick={() => setTab('phi')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === 'phi' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500'
          }`}
        >
          PHI 访问
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={filters.userId}
          onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
          placeholder="用户 ID"
          className="text-xs border border-slate-200 rounded px-2 py-1 w-32"
        />
        {tab === 'audit' && (
          <>
            <input
              type="text"
              value={filters.resource}
              onChange={(e) => setFilters({ ...filters, resource: e.target.value })}
              placeholder="资源类型"
              className="text-xs border border-slate-200 rounded px-2 py-1 w-32"
            />
            <input
              type="text"
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              placeholder="动作"
              className="text-xs border border-slate-200 rounded px-2 py-1 w-24"
            />
          </>
        )}
        <input
          type="date"
          value={filters.since}
          onChange={(e) => setFilters({ ...filters, since: e.target.value })}
          className="text-xs border border-slate-200 rounded px-2 py-1"
        />
        <span className="text-xs text-slate-400">至</span>
        <input
          type="date"
          value={filters.until}
          onChange={(e) => setFilters({ ...filters, until: e.target.value })}
          className="text-xs border border-slate-200 rounded px-2 py-1"
        />
      </div>

      {/* Table */}
      {tab === 'audit' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">时间</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">用户</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">动作</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">资源</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">IP</th>
              </tr>
            </thead>
            <tbody>
              {audit.isLoading && (
                <tr><td colSpan={5} className="p-4 text-center text-slate-400 text-xs">加载中…</td></tr>
              )}
              {!audit.isLoading && (audit.data ?? []).length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-slate-400 text-xs">无匹配记录</td></tr>
              )}
              {(audit.data ?? []).map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-xs text-slate-600">{new Date(row.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 font-mono">{row.userId?.slice(0, 8) ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">{row.action}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">
                    {row.resource}
                    {row.resourceId && (
                      <span className="ml-1 text-slate-400 font-mono">{row.resourceId.slice(0, 8)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 font-mono">{row.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">时间</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">操作者</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">来访者</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">资源</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">动作</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">原因</th>
              </tr>
            </thead>
            <tbody>
              {phi.isLoading && (
                <tr><td colSpan={6} className="p-4 text-center text-slate-400 text-xs">加载中…</td></tr>
              )}
              {!phi.isLoading && (phi.data ?? []).length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-slate-400 text-xs">无匹配记录</td></tr>
              )}
              {(phi.data ?? []).map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-xs text-slate-600">{new Date(row.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 font-mono">{row.userId.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 font-mono">{row.clientId.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">{row.resource}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">{row.action}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-xs">{row.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import {
  Key, Shield, ShieldCheck, ShieldAlert, ShieldX,
  RefreshCw, Plus, Trash2, Clock, X,
} from 'lucide-react';

interface LicenseRow {
  orgId: string;
  orgName: string;
  orgSlug: string;
  plan: string;
  memberCount: number;
  license: {
    status: 'active' | 'expired' | 'invalid' | 'none';
    tier: string | null;
    maxSeats: number | null;
    expiresAt: string | null;
    issuedAt: string | null;
  };
}

const STATUS_BADGE: Record<string, { label: string; className: string; Icon: typeof Shield }> = {
  active: { label: '有效', className: 'bg-emerald-100 text-emerald-700', Icon: ShieldCheck },
  expired: { label: '已过期', className: 'bg-red-100 text-red-700', Icon: ShieldX },
  invalid: { label: '无效', className: 'bg-orange-100 text-orange-700', Icon: ShieldAlert },
  none: { label: '未签发', className: 'bg-slate-100 text-slate-500', Icon: Shield },
};

const TIER_OPTIONS = [
  { value: 'solo', label: '个人版 (solo)' },
  { value: 'team', label: '团队版 (team)' },
  { value: 'enterprise', label: '企业版 (enterprise)' },
  { value: 'platform', label: '平台版 (platform)' },
];

const PLAN_LABELS: Record<string, string> = {
  free: '免费版',
  pro: '专业版',
  enterprise: '企业版',
};

export function LicenseManagement() {
  const [rows, setRows] = useState<LicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  // Issue modal
  const [issueTarget, setIssueTarget] = useState<LicenseRow | null>(null);
  const [issueForm, setIssueForm] = useState({ tier: 'team', maxSeats: 10, months: 12 });

  // Renew modal
  const [renewTarget, setRenewTarget] = useState<LicenseRow | null>(null);
  const [renewMonths, setRenewMonths] = useState(12);

  // Revoke confirm
  const [revokeTarget, setRevokeTarget] = useState<LicenseRow | null>(null);

  useEffect(() => {
    loadLicenses();
  }, []);

  async function loadLicenses() {
    setLoading(true);
    try {
      const data = await api.get<LicenseRow[]>('/admin/licenses');
      setRows(data);
    } catch (err) {
      console.error('Failed to load licenses:', err);
    } finally {
      setLoading(false);
    }
  }

  function showMsg(msg: string) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3000);
  }

  async function handleIssue() {
    if (!issueTarget) return;
    try {
      await api.post('/admin/licenses/issue', {
        orgId: issueTarget.orgId,
        tier: issueForm.tier,
        maxSeats: issueForm.maxSeats,
        months: issueForm.months,
      });
      showMsg(`已为 ${issueTarget.orgName} 签发许可证`);
      setIssueTarget(null);
      setIssueForm({ tier: 'team', maxSeats: 10, months: 12 });
      await loadLicenses();
    } catch (err: any) {
      showMsg(err.message || '签发失败');
    }
  }

  async function handleRenew() {
    if (!renewTarget) return;
    try {
      await api.post('/admin/licenses/renew', {
        orgId: renewTarget.orgId,
        months: renewMonths,
      });
      showMsg(`已为 ${renewTarget.orgName} 续期 ${renewMonths} 个月`);
      setRenewTarget(null);
      setRenewMonths(12);
      await loadLicenses();
    } catch (err: any) {
      showMsg(err.message || '续期失败');
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    try {
      await api.post('/admin/licenses/revoke', { orgId: revokeTarget.orgId });
      showMsg(`已撤销 ${revokeTarget.orgName} 的许可证`);
      setRevokeTarget(null);
      await loadLicenses();
    } catch (err: any) {
      showMsg(err.message || '撤销失败');
    }
  }

  // Summary stats
  const activeCount = rows.filter((r) => r.license.status === 'active').length;
  const expiredCount = rows.filter((r) => r.license.status === 'expired').length;
  const noneCount = rows.filter((r) => r.license.status === 'none').length;

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400">加载中...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Toast */}
      {actionMsg && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {actionMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">许可证管理</h2>
        <button
          onClick={loadLicenses}
          className="flex items-center gap-1.5 px-3 py-1.5 text-slate-600 hover:text-slate-900 text-sm transition"
        >
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>

      {/* Summary stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-4">
          <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{activeCount}</div>
            <div className="text-xs text-slate-400">有效许可</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-4">
          <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
            <ShieldX className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{expiredCount}</div>
            <div className="text-xs text-slate-400">已过期</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-4">
          <div className="w-11 h-11 bg-slate-50 rounded-xl flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{noneCount}</div>
            <div className="text-xs text-slate-400">未签发</div>
          </div>
        </div>
      </div>

      {/* License Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">机构</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">套餐</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">许可状态</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">层级</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">席位</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">到期时间</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">暂无机构</td>
              </tr>
            ) : (
              rows.map((row) => {
                const badge = STATUS_BADGE[row.license.status] || STATUS_BADGE.none;
                const BadgeIcon = badge.Icon;
                return (
                  <tr key={row.orgId} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{row.orgName}</div>
                      <div className="text-xs text-slate-400">{row.orgSlug}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-slate-600">
                        {PLAN_LABELS[row.plan] || row.plan}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${badge.className}`}>
                        <BadgeIcon className="w-3 h-3" />
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {row.license.tier || '-'}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {row.license.maxSeats != null
                        ? `${row.memberCount} / ${row.license.maxSeats}`
                        : `${row.memberCount}`}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {row.license.expiresAt
                        ? new Date(row.license.expiresAt).toLocaleDateString('zh-CN')
                        : '-'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setIssueTarget(row);
                            setIssueForm({ tier: (row.license.tier as string) || 'team', maxSeats: row.license.maxSeats || 10, months: 12 });
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition"
                          title="签发许可证"
                        >
                          <Plus className="w-3.5 h-3.5" /> 签发
                        </button>
                        {row.license.status === 'active' && (
                          <>
                            <button
                              onClick={() => { setRenewTarget(row); setRenewMonths(12); }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50 rounded transition"
                              title="续期"
                            >
                              <Clock className="w-3.5 h-3.5" /> 续期
                            </button>
                            <button
                              onClick={() => setRevokeTarget(row)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition"
                              title="撤销"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> 撤销
                            </button>
                          </>
                        )}
                        {row.license.status === 'expired' && (
                          <button
                            onClick={() => { setRenewTarget(row); setRenewMonths(12); }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50 rounded transition"
                            title="续期"
                          >
                            <Clock className="w-3.5 h-3.5" /> 续期
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Issue Modal */}
      {issueTarget && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={() => setIssueTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-[440px] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">签发许可证</h3>
              <button onClick={() => setIssueTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-sm text-slate-500 mb-4">
              为 <span className="font-medium text-slate-700">{issueTarget.orgName}</span> ({issueTarget.orgSlug}) 签发新许可证
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">层级 (Tier)</label>
                <select
                  value={issueForm.tier}
                  onChange={(e) => setIssueForm({ ...issueForm, tier: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  {TIER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">最大席位数</label>
                <input
                  type="number"
                  min={1}
                  value={issueForm.maxSeats}
                  onChange={(e) => setIssueForm({ ...issueForm, maxSeats: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">有效期 (月)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={issueForm.months}
                  onChange={(e) => setIssueForm({ ...issueForm, months: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setIssueTarget(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition"
              >
                取消
              </button>
              <button
                onClick={handleIssue}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
              >
                签发
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renew Modal */}
      {renewTarget && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={() => setRenewTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-[400px] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">续期许可证</h3>
              <button onClick={() => setRenewTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-sm text-slate-500 mb-4">
              为 <span className="font-medium text-slate-700">{renewTarget.orgName}</span> 续期许可证
              {renewTarget.license.tier && (
                <span className="ml-1 text-slate-400">
                  (当前层级: {renewTarget.license.tier}, 席位: {renewTarget.license.maxSeats})
                </span>
              )}
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">续期时长 (月)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={renewMonths}
                onChange={(e) => setRenewMonths(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setRenewTarget(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition"
              >
                取消
              </button>
              <button
                onClick={handleRenew}
                className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition"
              >
                续期
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Confirm Dialog */}
      {revokeTarget && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={() => setRevokeTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-[400px] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-red-600">撤销许可证</h3>
              <button onClick={() => setRevokeTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-sm text-slate-600 mb-1">
              确定要撤销 <span className="font-medium text-slate-900">{revokeTarget.orgName}</span> 的许可证吗？
            </div>
            <div className="text-xs text-slate-400 mb-5">
              撤销后该机构将失去当前许可授权的功能访问权限。此操作不可恢复，需要重新签发。
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRevokeTarget(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition"
              >
                取消
              </button>
              <button
                onClick={handleRevoke}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
              >
                确认撤销
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

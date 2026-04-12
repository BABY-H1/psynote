/**
 * License status card for org settings.
 *
 * Shows current tier, license status, seat usage, and expiry.
 * Allows org_admin to activate a new license key.
 */

import React, { useState } from 'react';
import { Shield, ShieldCheck, ShieldAlert, ShieldX, Users, Calendar, Key } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { useToast } from '../../../shared/components';
import { TIER_LABELS, type LicenseStatus } from '@psynote/shared';

interface SubscriptionData {
  tier: string;
  plan: string;
  label: string;
  features: string[];
  license: {
    status: LicenseStatus;
    maxSeats: number | null;
    expiresAt: string | null;
    seatsUsed: number;
  };
}

const STATUS_CONFIG: Record<LicenseStatus, {
  label: string;
  color: string;
  bgColor: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  active: { label: '已激活', color: 'text-emerald-700', bgColor: 'bg-emerald-50', Icon: ShieldCheck },
  expired: { label: '已过期', color: 'text-amber-700', bgColor: 'bg-amber-50', Icon: ShieldAlert },
  invalid: { label: '无效', color: 'text-red-700', bgColor: 'bg-red-50', Icon: ShieldX },
  none: { label: '未激活', color: 'text-slate-500', bgColor: 'bg-slate-50', Icon: Shield },
};

export function LicenseCard() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const setOrg = useAuthStore((s) => s.setOrg);
  const currentRole = useAuthStore((s) => s.currentRole);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [licenseInput, setLicenseInput] = useState('');
  const [showInput, setShowInput] = useState(false);

  const { data: sub, isLoading } = useQuery<SubscriptionData>({
    queryKey: ['subscription', orgId],
    queryFn: () => api.get(`/orgs/${orgId}/subscription`),
    enabled: !!orgId,
  });

  const activateMutation = useMutation({
    mutationFn: (licenseKey: string) =>
      api.post<{ success: boolean; tier: string; label: string; maxSeats: number; expiresAt: string }>(
        `/orgs/${orgId}/license`,
        { licenseKey },
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['subscription'] });
      // Update auth store with new tier
      if (orgId && currentRole) {
        setOrg(orgId, currentRole, data.tier as any, {
          status: 'active',
          maxSeats: data.maxSeats,
          expiresAt: data.expiresAt,
        });
      }
      setLicenseInput('');
      setShowInput(false);
      toast(`许可证已激活 — ${data.label}`, 'success');
    },
    onError: (err: any) => {
      toast(err?.message || '许可证激活失败', 'error');
    },
  });

  if (isLoading || !sub) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="text-sm text-slate-400">加载许可证信息…</div>
      </div>
    );
  }

  const { license } = sub;
  const statusCfg = STATUS_CONFIG[license.status];
  const StatusIcon = statusCfg.Icon;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Key className="w-4 h-4 text-slate-400" />
          许可证信息
        </h3>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bgColor} ${statusCfg.color}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {statusCfg.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Current tier */}
        <div className="space-y-1">
          <p className="text-xs text-slate-400 font-medium">当前版本</p>
          <p className="text-sm font-semibold text-slate-800">{sub.label}</p>
        </div>

        {/* Features count */}
        <div className="space-y-1">
          <p className="text-xs text-slate-400 font-medium">已解锁功能</p>
          <p className="text-sm font-semibold text-slate-800">{sub.features.length} 项</p>
        </div>

        {/* Seat usage */}
        <div className="space-y-1">
          <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <Users className="w-3 h-3" />
            席位使用
          </p>
          <p className="text-sm font-semibold text-slate-800">
            {license.seatsUsed}
            {license.maxSeats ? ` / ${license.maxSeats}` : ' (无限制)'}
          </p>
          {license.maxSeats && license.seatsUsed >= license.maxSeats && (
            <p className="text-xs text-amber-600">已达上限，无法添加新成员</p>
          )}
        </div>

        {/* Expiry */}
        <div className="space-y-1">
          <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            到期时间
          </p>
          <p className="text-sm font-semibold text-slate-800">
            {license.expiresAt
              ? new Date(license.expiresAt).toLocaleDateString('zh-CN')
              : '—'}
          </p>
          {license.status === 'expired' && (
            <p className="text-xs text-amber-600">许可证已过期，功能已降级为个人版</p>
          )}
        </div>
      </div>

      {/* Seat progress bar */}
      {license.maxSeats && (
        <div className="space-y-1">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                license.seatsUsed / license.maxSeats > 0.9 ? 'bg-amber-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(100, (license.seatsUsed / license.maxSeats) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Expiry warning banner */}
      {license.status === 'expired' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-800 font-medium">许可证已过期</p>
          <p className="text-xs text-amber-600 mt-1">
            系统已降级为个人版（solo）。请联系供应商获取新的许可证密钥以恢复功能。
          </p>
        </div>
      )}

      {/* Activate license */}
      {!showInput ? (
        <button
          type="button"
          onClick={() => setShowInput(true)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          {license.status === 'none' || license.status === 'expired'
            ? '激活许可证'
            : '更换许可证'}
        </button>
      ) : (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <label className="block text-sm font-medium text-slate-700">许可证密钥</label>
          <textarea
            value={licenseInput}
            onChange={(e) => setLicenseInput(e.target.value)}
            placeholder="粘贴许可证密钥…"
            rows={3}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => activateMutation.mutate(licenseInput.trim())}
              disabled={!licenseInput.trim() || activateMutation.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {activateMutation.isPending ? '验证中…' : '激活'}
            </button>
            <button
              type="button"
              onClick={() => { setShowInput(false); setLicenseInput(''); }}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

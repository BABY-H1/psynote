/**
 * SubscriptionTab — 经营信息板块的"订阅管理"子 tab。
 *
 * 4 段布局：
 *   1. 头部：套餐 / 组织类型 / 许可状态 / 到期时间  +  续期/升级 CTA
 *   2. 席位使用进度条
 *   3. AI 本月额度进度条（实际用量来自 /orgs/:id/ai-usage；仅已接入追踪的管道）
 *   4. 功能清单（当前 tier 已解锁 + 更高 tier 待解锁，带"联系销售"CTA）
 *   5. 许可证密钥录入（可折叠，默认隐藏）
 *
 * 数据源：
 *   - /orgs/:id/subscription  → SubscriptionInfo (tier, features, license, seatsUsed)
 *   - /orgs/:id/ai-usage      → { monthlyLimit, monthlyUsed, remaining, unlimited, callCount }
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key, Users, Calendar, Brain, Sparkles, Lock, Check,
  ShieldCheck, ShieldAlert, ShieldX, Shield, Mail, RefreshCw,
} from 'lucide-react';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { useToast } from '../../../shared/components';
import {
  TIER_LABELS,
  TIER_FEATURES,
  getOrgTypeDisplay,
  type Feature,
  type OrgTier,
  type LicenseStatus,
} from '@psynote/shared';

interface SubscriptionData {
  tier: OrgTier;
  plan: string;
  label: string;
  features: Feature[];
  license: {
    status: LicenseStatus;
    maxSeats: number | null;
    expiresAt: string | null;
    seatsUsed: number;
  };
}

interface AiUsageData {
  monthStart: string;
  monthlyLimit: number;
  monthlyUsed: number;
  remaining: number | null;
  percentUsed: number | null;
  callCount: number;
  unlimited: boolean;
}

const STATUS_CONFIG: Record<LicenseStatus, {
  label: string;
  color: string;
  bgColor: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  active:  { label: '已激活', color: 'text-emerald-700', bgColor: 'bg-emerald-50', Icon: ShieldCheck },
  expired: { label: '已过期', color: 'text-amber-700',   bgColor: 'bg-amber-50',   Icon: ShieldAlert },
  invalid: { label: '无效',   color: 'text-red-700',     bgColor: 'bg-red-50',     Icon: ShieldX },
  none:    { label: '未激活', color: 'text-slate-500',   bgColor: 'bg-slate-50',   Icon: Shield },
};

const FEATURE_LABELS: Record<Feature, { label: string; description: string }> = {
  core:            { label: '核心功能',   description: '测评、咨询、团辅、课程、Portal' },
  audit_log:       { label: '审计日志',   description: '操作记录查看' },
  referral_export: { label: '转介导出',   description: 'PDF 格式导出' },
  referral_full:   { label: '完整转介',   description: '跨机构数据传输' },
  supervisor:      { label: '督导协作',   description: '督导关系 + 笔记审阅' },
  branding:        { label: '品牌定制',   description: 'Logo、主题色、报告页眉页脚' },
  partnership:     { label: '合作机构',   description: '跨组织合作、咨询师指派' },
  sso:             { label: 'SSO 登录',   description: 'SAML/OIDC 单点登录' },
  api:             { label: '开放 API',   description: '公开 REST API' },
};

const TIER_ORDER: OrgTier[] = ['starter', 'growth', 'flagship'];

const UPGRADE_CONTACT = 'sales@psynote.com';

export function SubscriptionTab() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const currentOrgType = useAuthStore((s) => s.currentOrgType);
  const setOrg = useAuthStore((s) => s.setOrg);
  const currentRole = useAuthStore((s) => s.currentRole);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [licenseInput, setLicenseInput] = useState('');
  const [showLicenseInput, setShowLicenseInput] = useState(false);

  const { data: sub, isLoading: subLoading } = useQuery<SubscriptionData>({
    queryKey: ['subscription', orgId],
    queryFn: () => api.get(`/orgs/${orgId}/subscription`),
    enabled: !!orgId,
  });

  const { data: aiUsage } = useQuery<AiUsageData>({
    queryKey: ['ai-usage', orgId],
    queryFn: () => api.get(`/orgs/${orgId}/ai-usage`),
    enabled: !!orgId,
    refetchInterval: 120_000, // refresh every 2 min
  });

  const activateMutation = useMutation({
    mutationFn: (licenseKey: string) =>
      api.post<{ success: boolean; tier: string; label: string; maxSeats: number; expiresAt: string }>(
        `/orgs/${orgId}/license`,
        { licenseKey },
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['subscription'] });
      if (orgId && currentRole) {
        setOrg(orgId, currentRole, data.tier as OrgTier, {
          status: 'active',
          maxSeats: data.maxSeats,
          expiresAt: data.expiresAt,
        });
      }
      setLicenseInput('');
      setShowLicenseInput(false);
      toast(`许可证已激活 — ${data.label}`, 'success');
    },
    onError: (err: any) => toast(err?.message || '许可证激活失败', 'error'),
  });

  if (subLoading || !sub) {
    return <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-400">加载订阅信息…</div>;
  }

  const tierSet = new Set(sub.features);
  const statusCfg = STATUS_CONFIG[sub.license.status];
  const StatusIcon = statusCfg.Icon;
  const typeDisplay = getOrgTypeDisplay(currentOrgType);
  const expired = sub.license.status === 'expired';

  // Seat progress
  const seatPercent = sub.license.maxSeats
    ? Math.min(100, (sub.license.seatsUsed / sub.license.maxSeats) * 100)
    : 0;

  // AI usage progress
  const aiPercent = aiUsage?.percentUsed ?? null;
  const aiUsedPretty = aiUsage ? formatTokens(aiUsage.monthlyUsed) : '—';
  const aiLimitPretty = aiUsage?.unlimited ? '无限制' : aiUsage ? formatTokens(aiUsage.monthlyLimit) : '—';

  return (
    <div className="space-y-6">
      {/* ─── 1. Summary header ───────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Key className="w-4 h-4 text-slate-400" />
            当前订阅
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`mailto:${UPGRADE_CONTACT}?subject=psynote 套餐续期 / 升级咨询&body=机构: ${sub.label} / ${typeDisplay.label}%0A组织 ID: ${orgId}%0A%0A请联系我们:`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
            >
              <Mail className="w-3.5 h-3.5" />
              联系销售 · 续期/升级
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCell label="套餐" value={sub.label} />
          <SummaryCell label="组织类型" value={typeDisplay.label} />
          <SummaryCell
            label="许可状态"
            value={
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bgColor} ${statusCfg.color}`}>
                <StatusIcon className="w-3 h-3" />
                {statusCfg.label}
              </span>
            }
          />
          <SummaryCell
            label="到期时间"
            value={sub.license.expiresAt ? new Date(sub.license.expiresAt).toLocaleDateString('zh-CN') : '—'}
          />
        </div>

        {expired && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            许可证已过期，系统已降级为入门版。请联系销售获取新密钥以恢复全部功能。
          </div>
        )}
      </div>

      {/* ─── 2+3. Seats and AI usage ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Seat usage */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Users className="w-4 h-4 text-slate-400" />
              席位使用
            </div>
            <span className="text-xs text-slate-400">
              {sub.license.seatsUsed}
              {sub.license.maxSeats ? ` / ${sub.license.maxSeats}` : ' / 无限制'}
            </span>
          </div>
          {sub.license.maxSeats ? (
            <>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${seatPercent > 90 ? 'bg-amber-500' : 'bg-blue-500'}`}
                  style={{ width: `${seatPercent}%` }}
                />
              </div>
              {sub.license.seatsUsed >= sub.license.maxSeats && (
                <p className="text-xs text-amber-600">已达上限，无法添加新成员</p>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-400">当前套餐席位不设上限</p>
          )}
        </div>

        {/* AI usage */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Brain className="w-4 h-4 text-slate-400" />
              AI 本月用量
            </div>
            <span className="text-xs text-slate-400">
              {aiUsedPretty} / {aiLimitPretty}
            </span>
          </div>
          {aiUsage?.unlimited ? (
            <p className="text-xs text-slate-400">未配置月度限额，视为不限量</p>
          ) : aiPercent !== null && aiPercent !== undefined ? (
            <>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${aiPercent > 90 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${aiPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                本月已调用 {aiUsage?.callCount ?? 0} 次 · 仅统计已接入追踪的管道
              </p>
            </>
          ) : (
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-slate-300 w-0" />
            </div>
          )}
        </div>
      </div>

      {/* ─── 4. Feature matrix ───────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Sparkles className="w-4 h-4 text-slate-400" />
            功能清单
          </div>
          <span className="text-xs text-slate-400">{sub.label} · 已解锁 {sub.features.length} 项</span>
        </div>

        <div className="space-y-2">
          {TIER_ORDER.map((tier) => (
            <TierFeatureGroup
              key={tier}
              tier={tier}
              currentTier={sub.tier}
              unlocked={tierSet}
            />
          ))}
        </div>
      </div>

      {/* ─── 5. License key management ───────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        {!showLicenseInput ? (
          <button
            type="button"
            onClick={() => setShowLicenseInput(true)}
            className="text-sm text-slate-600 hover:text-blue-700 font-medium flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {sub.license.status === 'none' || sub.license.status === 'expired'
              ? '录入许可证密钥'
              : '更换许可证密钥'}
          </button>
        ) : (
          <div className="space-y-3">
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
                onClick={() => { setShowLicenseInput(false); setLicenseInput(''); }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function TierFeatureGroup({
  tier,
  currentTier,
  unlocked,
}: {
  tier: OrgTier;
  currentTier: OrgTier;
  unlocked: Set<Feature>;
}) {
  // Features only in this tier (not already granted by lower tiers)
  const lowerTiers = TIER_ORDER.slice(0, TIER_ORDER.indexOf(tier));
  const lowerFeatures = new Set(lowerTiers.flatMap((t) => Array.from(TIER_FEATURES[t])));
  const myFeatures = Array.from(TIER_FEATURES[tier]).filter((f) => !lowerFeatures.has(f));

  if (myFeatures.length === 0) return null;

  const isCurrent = tier === currentTier;
  const isHigher = TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(currentTier);

  return (
    <div className={`rounded-lg px-3 py-2 ${isCurrent ? 'bg-blue-50/50' : isHigher ? 'bg-slate-50' : 'bg-transparent'}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-slate-600 mb-1.5">
        {isCurrent ? (
          <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px]">当前</span>
        ) : isHigher ? (
          <Lock className="w-3 h-3 text-slate-400" />
        ) : (
          <Check className="w-3 h-3 text-emerald-500" />
        )}
        <span>{TIER_LABELS[tier]} 套餐</span>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-1">
        {myFeatures.map((f) => {
          const fl = FEATURE_LABELS[f];
          const has = unlocked.has(f);
          return (
            <span
              key={f}
              title={fl?.description}
              className={`text-xs px-2 py-0.5 rounded-full border ${
                has
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-white text-slate-400 border-slate-200 line-through'
              }`}
            >
              {fl?.label || f}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** 3500 → "3.5k"；1200000 → "1.2M"；0 → "0" */
function formatTokens(n: number): string {
  if (!n || n < 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

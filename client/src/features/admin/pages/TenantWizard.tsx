import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api/client';
import { ArrowLeft, ArrowRight, Check, Building2, CreditCard, UserPlus, Settings, CheckCircle2 } from 'lucide-react';
import { TIER_LABELS, TIER_FEATURES, hasFeature, type OrgTier } from '@psynote/shared';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WizardState {
  org: { name: string; slug: string };
  subscription: { tier: OrgTier; maxSeats: number; months: number };
  admin: { mode: 'new' | 'existing'; userId: string; email: string; name: string; password: string };
  settings: Record<string, unknown>;
  providerOrgId: string; // EAP: optional binding to a counseling org
}

const TIER_DEFAULTS: Record<OrgTier, number> = {
  solo: 1,
  team: 10,
  enterprise: 50,
  platform: 200,
};

const STEPS = [
  { key: 'org', label: '基本信息', icon: Building2 },
  { key: 'subscription', label: '订阅方案', icon: CreditCard },
  { key: 'admin', label: '管理员账号', icon: UserPlus },
  { key: 'config', label: '初始配置', icon: Settings },
  { key: 'confirm', label: '确认创建', icon: CheckCircle2 },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TenantWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [state, setState] = useState<WizardState>({
    org: { name: '', slug: '' },
    subscription: { tier: 'team', maxSeats: 10, months: 12 },
    admin: { mode: 'new', userId: '', email: '', name: '', password: '' },
    settings: {},
    providerOrgId: '',
  });

  // Load available orgs for provider selection (enterprise tier only)
  const [availableOrgs, setAvailableOrgs] = useState<{ id: string; name: string; slug: string }[]>([]);
  const isEnterpriseTier = hasFeature(state.subscription.tier, 'eap');

  useEffect(() => {
    if (isEnterpriseTier) {
      api.get<any[]>('/admin/tenants').then((orgs) => {
        // Filter to non-enterprise orgs as potential providers
        setAvailableOrgs(orgs.filter((o: any) => !o.isEnterprise).map((o: any) => ({
          id: o.id, name: o.name, slug: o.slug,
        })));
      }).catch(() => {});
    }
  }, [isEnterpriseTier]);

  function updateOrg(patch: Partial<WizardState['org']>) {
    setState((s) => ({ ...s, org: { ...s.org, ...patch } }));
  }

  function updateSub(patch: Partial<WizardState['subscription']>) {
    setState((s) => ({ ...s, subscription: { ...s.subscription, ...patch } }));
  }

  function updateAdmin(patch: Partial<WizardState['admin']>) {
    setState((s) => ({ ...s, admin: { ...s.admin, ...patch } }));
  }

  function autoSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  }

  function canNext(): boolean {
    switch (step) {
      case 0: return !!state.org.name.trim() && !!state.org.slug.trim();
      case 1: return state.subscription.maxSeats > 0 && state.subscription.months > 0;
      case 2: {
        if (state.admin.mode === 'new') {
          return !!state.admin.email && !!state.admin.name && state.admin.password.length >= 6;
        }
        return !!state.admin.userId;
      }
      case 3: return true;
      case 4: return true;
      default: return false;
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        org: state.org,
        subscription: state.subscription,
        admin: state.admin.mode === 'new'
          ? { email: state.admin.email, name: state.admin.name, password: state.admin.password }
          : { userId: state.admin.userId },
        settings: state.settings,
        ...(state.providerOrgId ? { providerOrgId: state.providerOrgId } : {}),
      };
      const result = await api.post<{ orgId: string }>('/admin/tenants', payload);
      navigate(`/admin/tenants/${result.orgId}`);
    } catch (err: any) {
      setError(err?.message || '创建失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate('/admin/tenants')}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回租户列表
      </button>

      <h1 className="text-xl font-bold text-slate-900 mb-6">新建租户</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map(({ key, label, icon: Icon }, i) => (
          <div key={key} className="flex items-center">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                i === step
                  ? 'bg-blue-500 text-white'
                  : i < step
                    ? 'bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {i < step ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
              {label}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`w-6 h-px mx-1 ${i < step ? 'bg-blue-300' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 mb-4">机构基本信息</h2>
            <div>
              <label className="block text-sm text-slate-600 mb-1">机构名称 *</label>
              <input
                type="text"
                placeholder="如：阳光心理健康中心"
                value={state.org.name}
                onChange={(e) => {
                  const name = e.target.value;
                  updateOrg({ name, slug: autoSlug(name) });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">机构标识 (slug) *</label>
              <input
                type="text"
                placeholder="如：sunshine-center"
                value={state.org.slug}
                onChange={(e) => updateOrg({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">只能包含小写字母、数字和连字符，全局唯一</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 mb-4">订阅方案</h2>
            <div>
              <label className="block text-sm text-slate-600 mb-2">套餐等级</label>
              <div className="grid grid-cols-4 gap-3">
                {(Object.keys(TIER_LABELS) as OrgTier[]).map((tier) => {
                  const features = Array.from(TIER_FEATURES[tier]);
                  const isSelected = state.subscription.tier === tier;
                  return (
                    <button
                      key={tier}
                      onClick={() => updateSub({ tier, maxSeats: TIER_DEFAULTS[tier] })}
                      className={`text-left p-3 rounded-lg border-2 transition ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="text-sm font-medium text-slate-900">{TIER_LABELS[tier]}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {features.join(' / ')}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">最大席位数</label>
                <input
                  type="number"
                  min={1}
                  value={state.subscription.maxSeats}
                  onChange={(e) => updateSub({ maxSeats: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">有效期（月）</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={state.subscription.months}
                  onChange={(e) => updateSub({ months: parseInt(e.target.value) || 12 })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 mb-4">管理员账号</h2>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => updateAdmin({ mode: 'new' })}
                className={`px-4 py-2 text-sm rounded-lg border transition ${
                  state.admin.mode === 'new' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                创建新用户
              </button>
              <button
                onClick={() => updateAdmin({ mode: 'existing' })}
                className={`px-4 py-2 text-sm rounded-lg border transition ${
                  state.admin.mode === 'existing' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                选择已有用户
              </button>
            </div>

            {state.admin.mode === 'new' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">姓名 *</label>
                  <input
                    type="text"
                    value={state.admin.name}
                    onChange={(e) => updateAdmin({ name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">邮箱 *</label>
                  <input
                    type="email"
                    value={state.admin.email}
                    onChange={(e) => updateAdmin({ email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">密码 * （至少 6 位）</label>
                  <input
                    type="password"
                    value={state.admin.password}
                    onChange={(e) => updateAdmin({ password: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm text-slate-600 mb-1">用户 ID</label>
                <input
                  type="text"
                  placeholder="输入已有用户的 ID"
                  value={state.admin.userId}
                  onChange={(e) => updateAdmin({ userId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 font-mono"
                />
                <p className="text-xs text-slate-400 mt-1">可在用户管理中查找用户 ID</p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 mb-4">初始配置</h2>

            {isEnterpriseTier && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  绑定合作机构（可选）
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  如果该企业需要外部心理服务机构提供服务，可以在此绑定。绑定后机构管理员可以指派咨询师到该企业。
                </p>
                <select
                  value={state.providerOrgId}
                  onChange={(e) => setState((s) => ({ ...s, providerOrgId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">不绑定（企业自有咨询师）</option>
                  {availableOrgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!isEnterpriseTier && (
              <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-500">
                当前版本使用默认配置。后续可在此步骤添加自定义分诊规则、功能开关等。
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 mb-4">确认创建</h2>
            <div className="divide-y divide-slate-100 bg-slate-50 rounded-lg overflow-hidden">
              <SummaryRow label="机构名称" value={state.org.name} />
              <SummaryRow label="机构标识" value={state.org.slug} mono />
              <SummaryRow label="套餐等级" value={TIER_LABELS[state.subscription.tier]} />
              <SummaryRow label="最大席位" value={String(state.subscription.maxSeats)} />
              <SummaryRow label="有效期" value={`${state.subscription.months} 个月`} />
              <SummaryRow
                label="管理员"
                value={state.admin.mode === 'new' ? `${state.admin.name} (${state.admin.email})` : `用户 ${state.admin.userId}`}
              />
              {isEnterpriseTier && (
                <SummaryRow
                  label="合作机构"
                  value={
                    state.providerOrgId
                      ? availableOrgs.find((o) => o.id === state.providerOrgId)?.name || state.providerOrgId
                      : '不绑定（自有咨询师）'
                  }
                />
              )}
            </div>
            {error && (
              <div className="bg-red-50 text-red-600 rounded-lg p-3 text-sm">{error}</div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={() => step > 0 && setStep(step - 1)}
          disabled={step === 0}
          className={`flex items-center gap-1 text-sm px-4 py-2 rounded-lg transition ${
            step === 0 ? 'text-slate-300' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          上一步
        </button>

        {step < 4 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext()}
            className={`flex items-center gap-1 text-sm px-4 py-2 rounded-lg transition ${
              canNext()
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            下一步
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1 text-sm bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition disabled:opacity-50"
          >
            {submitting ? '创建中...' : '确认创建'}
            <Check className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

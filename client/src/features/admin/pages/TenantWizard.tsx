import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api/client';
import { ArrowLeft, ArrowRight, Check, Building2, CreditCard, UserPlus, Settings, CheckCircle2, Briefcase, Stethoscope } from 'lucide-react';
import { TIER_LABELS, TIER_FEATURES, hasFeature, type OrgTier } from '@psynote/shared';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type OrgType = 'solo' | 'counseling' | 'enterprise';

interface WizardState {
  orgType: OrgType;
  org: { name: string; slug: string };
  subscription: { tier: OrgTier; maxSeats: number; months: number };
  admin: { mode: 'new' | 'existing'; userId: string; email: string; name: string; password: string };
  settings: Record<string, unknown>;
  providerOrgId: string;
}

const TIER_DEFAULTS: Record<OrgTier, number> = {
  starter: 1,
  growth: 10,
  flagship: 50,
};

const ALL_TIERS: OrgTier[] = ['starter', 'growth', 'flagship'];

const STEPS = [
  { key: 'type', label: '组织类型', icon: Building2 },
  { key: 'org', label: '基本信息', icon: Building2 },
  { key: 'subscription', label: '订阅方案', icon: CreditCard },
  { key: 'admin', label: '管理员账号', icon: UserPlus },
  { key: 'config', label: '初始配置', icon: Settings },
  { key: 'confirm', label: '确认创建', icon: CheckCircle2 },
];

/* ------------------------------------------------------------------ */
/*  Org type config                                                    */
/* ------------------------------------------------------------------ */

const ORG_TYPE_CONFIG = {
  solo: {
    label: '个体咨询师',
    description: '独立执业的心理咨询师，1 人使用',
    icon: UserPlus,
    color: 'border-green-500 bg-green-50',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    nameLabel: '执业名称',
    namePlaceholder: '如：张老师心理工作室',
    slugLabel: '标识 (slug)',
    adminLabel: '咨询师账号',
  },
  counseling: {
    label: '专业机构',
    description: '心理咨询中心、治疗机构、EAP 服务商等多人团队',
    icon: Stethoscope,
    color: 'border-blue-500 bg-blue-50',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    nameLabel: '机构名称',
    namePlaceholder: '如：阳光心理健康中心',
    slugLabel: '机构标识 (slug)',
    adminLabel: '机构管理员',
  },
  enterprise: {
    label: '企业',
    description: '国企、央企、民企等需要 EAP 员工心理援助服务的企业或工会',
    icon: Briefcase,
    color: 'border-amber-500 bg-amber-50',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    nameLabel: '企业名称',
    namePlaceholder: '如：中石化工会心理关爱中心',
    slugLabel: '企业标识 (slug)',
    adminLabel: '企业管理员（HR/工会）',
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TenantWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [state, setState] = useState<WizardState>({
    orgType: 'solo',
    org: { name: '', slug: '' },
    subscription: { tier: 'starter' as OrgTier, maxSeats: 1, months: 12 },
    admin: { mode: 'new', userId: '', email: '', name: '', password: '' },
    settings: {},
    providerOrgId: '',
  });

  const config = ORG_TYPE_CONFIG[state.orgType];
  const isEnterprise = state.orgType === 'enterprise';
  const availableTiers = ALL_TIERS;

  // Load available orgs for provider selection (enterprise only)
  const [availableOrgs, setAvailableOrgs] = useState<{ id: string; name: string; slug: string }[]>([]);

  useEffect(() => {
    if (isEnterprise) {
      api.get<any[]>('/admin/tenants').then((orgs) => {
        setAvailableOrgs(orgs.filter((o: any) => o.settings?.orgType !== 'enterprise').map((o: any) => ({
          id: o.id, name: o.name, slug: o.slug,
        })));
      }).catch(() => {});
    }
  }, [isEnterprise]);

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

  function selectOrgType(type: OrgType) {
    const defaultTier: OrgTier = type === 'solo' ? 'starter' : type === 'enterprise' ? 'growth' : 'growth';
    setState((s) => ({
      ...s,
      orgType: type,
      subscription: { ...s.subscription, tier: defaultTier, maxSeats: TIER_DEFAULTS[defaultTier] },
      providerOrgId: '',
    }));
  }

  function canNext(): boolean {
    switch (step) {
      case 0: return true; // type selection always has a default
      case 1: return !!state.org.name.trim() && !!state.org.slug.trim();
      case 2: return state.subscription.maxSeats > 0 && state.subscription.months > 0;
      case 3: {
        if (state.admin.mode === 'new') {
          return !!state.admin.email && !!state.admin.name && state.admin.password.length >= 6;
        }
        return !!state.admin.userId;
      }
      case 4: return true;
      case 5: return true;
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
        settings: { ...state.settings, orgType: state.orgType },
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
      <div className="flex items-center gap-1 mb-8 overflow-x-auto">
        {STEPS.map(({ key, label, icon: Icon }, i) => (
          <div key={key} className="flex items-center">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                i === step
                  ? isEnterprise ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                  : i < step
                    ? isEnterprise ? 'bg-amber-100 text-amber-700 cursor-pointer hover:bg-amber-200' : 'bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {i < step ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
              {label}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`w-6 h-px mx-1 ${i < step ? (isEnterprise ? 'bg-amber-300' : 'bg-blue-300') : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">

        {/* Step 0: Org Type Selection */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 mb-2">选择组织类型</h2>
            <p className="text-sm text-slate-500 mb-4">决定租户的管理界面和功能范围</p>

            <div className="grid grid-cols-3 gap-4">
              {(['solo', 'counseling', 'enterprise'] as OrgType[]).map((type) => {
                const c = ORG_TYPE_CONFIG[type];
                const Icon = c.icon;
                const selected = state.orgType === type;
                return (
                  <button
                    key={type}
                    onClick={() => selectOrgType(type)}
                    className={`text-left p-5 rounded-xl border-2 transition ${
                      selected ? c.color : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.iconBg}`}>
                        <Icon className={`w-5 h-5 ${c.iconColor}`} />
                      </div>
                      <div className="text-base font-semibold text-slate-900">{c.label}</div>
                    </div>
                    <p className="text-sm text-slate-500">{c.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 mb-4">{config.nameLabel}</h2>
            <div>
              <label className="block text-sm text-slate-600 mb-1">{config.nameLabel} *</label>
              <input
                type="text"
                placeholder={config.namePlaceholder}
                value={state.org.name}
                onChange={(e) => {
                  const name = e.target.value;
                  updateOrg({ name, slug: autoSlug(name) });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">{config.slugLabel} *</label>
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

        {/* Step 2: Subscription */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 mb-4">订阅方案</h2>
            <div>
              <label className="block text-sm text-slate-600 mb-2">套餐等级</label>
              <div className={`grid gap-3 ${availableTiers.length <= 2 ? 'grid-cols-2' : 'grid-cols-4'}`}>
                {availableTiers.map((tier) => {
                  const features = Array.from(TIER_FEATURES[tier]);
                  const isSelected = state.subscription.tier === tier;
                  return (
                    <button
                      key={tier}
                      onClick={() => updateSub({ tier, maxSeats: TIER_DEFAULTS[tier] })}
                      className={`text-left p-3 rounded-lg border-2 transition ${
                        isSelected
                          ? isEnterprise ? 'border-amber-500 bg-amber-50' : 'border-blue-500 bg-blue-50'
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
                <label className="block text-sm text-slate-600 mb-1">
                  {isEnterprise ? '员工席位数' : '最大席位数'}
                </label>
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

        {/* Step 3: Admin Account */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 mb-4">{config.adminLabel}</h2>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => updateAdmin({ mode: 'new' })}
                className={`px-4 py-2 text-sm rounded-lg border transition ${
                  state.admin.mode === 'new'
                    ? isEnterprise ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                创建新用户
              </button>
              <button
                onClick={() => updateAdmin({ mode: 'existing' })}
                className={`px-4 py-2 text-sm rounded-lg border transition ${
                  state.admin.mode === 'existing'
                    ? isEnterprise ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600'
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

        {/* Step 4: Config */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 mb-4">初始配置</h2>

            {isEnterprise && (
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

            {!isEnterprise && (
              <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-500">
                当前版本使用默认配置。后续可在此步骤添加自定义分诊规则、功能开关等。
              </div>
            )}
          </div>
        )}

        {/* Step 5: Confirm */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 mb-4">确认创建</h2>
            <div className="divide-y divide-slate-100 bg-slate-50 rounded-lg overflow-hidden">
              <SummaryRow
                label="组织类型"
                value={config.label}
                badge={isEnterprise ? 'amber' : 'blue'}
              />
              <SummaryRow label={config.nameLabel} value={state.org.name} />
              <SummaryRow label={config.slugLabel} value={state.org.slug} mono />
              <SummaryRow label="套餐等级" value={TIER_LABELS[state.subscription.tier]} />
              <SummaryRow label={isEnterprise ? '员工席位' : '最大席位'} value={String(state.subscription.maxSeats)} />
              <SummaryRow label="有效期" value={`${state.subscription.months} 个月`} />
              <SummaryRow
                label={config.adminLabel}
                value={state.admin.mode === 'new' ? `${state.admin.name} (${state.admin.email})` : `用户 ${state.admin.userId}`}
              />
              {isEnterprise && (
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

        {step < 5 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext()}
            className={`flex items-center gap-1 text-sm px-4 py-2 rounded-lg transition ${
              canNext()
                ? isEnterprise ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-blue-500 text-white hover:bg-blue-600'
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

function SummaryRow({ label, value, mono, badge }: { label: string; value: string; mono?: boolean; badge?: 'amber' | 'blue' }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      {badge ? (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          badge === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {value}
        </span>
      ) : (
        <span className={`text-sm font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
      )}
    </div>
  );
}

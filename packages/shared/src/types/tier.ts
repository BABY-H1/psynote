/**
 * SaaS tier & feature flag taxonomy — v2 (套餐体系重构)
 *
 * 两个正交维度：
 *   1. 功能等级 (OrgTier) — 控制可用功能范围
 *      starter   入门版  个体执业，1 席位
 *      growth    成长版  团队/工作室，按人数收费
 *      flagship  旗舰版  机构级，对外合作
 *
 *   2. 组织类型 (OrgType) — 控制界面和场景特有能力
 *      counseling  专业机构
 *      enterprise  企业（工会/HR 管理）
 *      school      学校（占位）
 *      hospital    医疗机构（占位）
 *
 * 最终功能集 = TIER_FEATURES[tier] ∪ ORG_TYPE_FEATURES[orgType]
 */

// ─── Tier (功能等级) ─────────────────────────────────────────────

export type OrgTier = 'starter' | 'growth' | 'flagship';

export type Feature =
  | 'core'            // 基础全部功能（测评、咨询、团辅、课程、Portal 等）
  | 'audit_log'       // 审计日志查看界面
  | 'referral_export' // 转介 — 仅导出 PDF
  | 'referral_full'   // 转介 — 完整平台模式（跨机构数据传输）
  | 'supervisor'      // 督导关系 + 笔记审阅
  | 'branding'        // 品牌定制（Logo、主题色、报告页眉页脚）
  | 'partnership'     // 跨组织合作（建立合作关系、咨询师指派）
  | 'sso'             // SAML/OIDC 单点登录
  | 'api';            // 公开 REST API

/**
 * Static tier → feature set mapping.
 * 入门版 → 成长版：团队化（督导、品牌、完整转介）
 * 成长版 → 旗舰版：对外扩张（跨组织合作、SSO、API）
 */
export const TIER_FEATURES: Record<OrgTier, ReadonlySet<Feature>> = {
  starter: new Set<Feature>([
    'core',
    'audit_log',
    'referral_export',
  ]),
  growth: new Set<Feature>([
    'core',
    'audit_log',
    'referral_export',
    'referral_full',
    'supervisor',
    'branding',
  ]),
  flagship: new Set<Feature>([
    'core',
    'audit_log',
    'referral_export',
    'referral_full',
    'supervisor',
    'branding',
    'partnership',
    'sso',
    'api',
  ]),
};

// ─── OrgType (组织类型) ──────────────────────────────────────────

export type OrgType = 'solo' | 'counseling' | 'enterprise' | 'school' | 'hospital';

export type OrgTypeFeature = 'eap' | 'school'; // orgType 自带功能

/**
 * 组织类型自带功能。
 *   solo        — 个体咨询师，简化界面
 *   counseling  — 专业机构，完整管理功能
 *   enterprise  — 企业，自动获得 EAP 能力
 *   school      — 学校（占位）
 *   hospital    — 医疗机构（占位）
 */
export const ORG_TYPE_FEATURES: Record<OrgType, ReadonlySet<OrgTypeFeature>> = {
  solo:       new Set(),
  counseling: new Set(),
  enterprise: new Set(['eap']),
  school:     new Set(['school']),
  hospital:   new Set(),
};

// ─── Feature checking ────────────────────────────────────────────

/**
 * Check whether a given tier includes a given feature.
 * Optionally also checks orgType-specific features.
 *
 * ```ts
 * hasFeature('starter', 'core')                      // true
 * hasFeature('starter', 'supervisor')                 // false
 * hasFeature('growth', 'supervisor')                  // true
 * hasFeature('starter', 'eap')                        // false
 * hasFeature('starter', 'eap', 'enterprise')          // true (orgType自带)
 * hasFeature('flagship', 'partnership')               // true
 * ```
 */
export function hasFeature(
  tier: OrgTier,
  feature: Feature | OrgTypeFeature,
  orgType?: OrgType,
): boolean {
  const tierSet = TIER_FEATURES[tier] ?? TIER_FEATURES.starter;
  if (tierSet.has(feature as Feature)) return true;

  if (orgType) {
    const typeSet = ORG_TYPE_FEATURES[orgType] ?? ORG_TYPE_FEATURES.counseling;
    if (typeSet.has(feature as OrgTypeFeature)) return true;
  }

  return false;
}

/**
 * Check if an orgType has a specific orgType-level feature.
 */
export function hasOrgTypeFeature(orgType: OrgType, feature: OrgTypeFeature): boolean {
  const set = ORG_TYPE_FEATURES[orgType] ?? ORG_TYPE_FEATURES.counseling;
  return set.has(feature);
}

// ─── Plan ↔ Tier mapping ────────────────────────────────────────

/**
 * Map the raw `organizations.plan` DB value to an `OrgTier`.
 * Handles legacy values: 'enterprise' → 'growth', 'platform' → 'flagship'.
 */
export function planToTier(plan: string | null | undefined): OrgTier {
  switch (plan) {
    case 'free':
      return 'starter';
    case 'pro':
      return 'growth';
    case 'enterprise':    // legacy — old enterprise plan maps to growth
      return 'growth';
    case 'premium':
      return 'flagship';
    case 'platform':      // legacy — old platform maps to flagship
      return 'flagship';
    default:
      return 'starter';
  }
}

/**
 * Reverse map an OrgTier to the DB `organizations.plan` value.
 */
export function tierToPlan(tier: OrgTier): string {
  switch (tier) {
    case 'starter':
      return 'free';
    case 'growth':
      return 'pro';
    case 'flagship':
      return 'premium';
    default:
      return 'free';
  }
}

// ─── Display labels ──────────────────────────────────────────────

export type LicenseStatus = 'active' | 'expired' | 'invalid' | 'none';

export interface LicenseInfo {
  status: LicenseStatus;
  maxSeats: number | null;
  expiresAt: string | null;
}

export const TIER_LABELS: Record<OrgTier, string> = {
  starter:  '入门版',
  growth:   '成长版',
  flagship: '旗舰版',
};

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  solo:       '个体咨询师',
  counseling: '专业机构',
  enterprise: '企业',
  school:     '学校',
  hospital:   '医疗机构',
};

// ─── OrgType 统一展示元数据 ──────────────────────────────────────
/**
 * 5 种组织类型在 UI 各处（租户列表徽章、详情头部、向导卡片）共享的
 * 展示配置。改这里一次，三个地方同步更新。
 */
export type OrgTypeTheme = 'green' | 'blue' | 'amber' | 'teal' | 'rose';

export interface OrgTypeDisplay {
  /** 短徽章文本，2 字最佳 */
  badge: string;
  /** 完整名称 */
  label: string;
  /** 对内描述 */
  description: string;
  /** 主题色名（tailwind palette key） */
  theme: OrgTypeTheme;
  /** 徽章 class */
  badgeClass: string;
  /** Avatar/iconBg class */
  iconBgClass: string;
  /** Icon 颜色 class */
  iconColorClass: string;
  /** 名称字段 label */
  nameLabel: string;
  /** slug 字段 label */
  slugLabel: string;
  /** 管理员字段 label */
  adminLabel: string;
  /** 创建向导 placeholder */
  namePlaceholder: string;
}

export const ORG_TYPE_DISPLAY: Record<OrgType, OrgTypeDisplay> = {
  solo: {
    badge: '个体',
    label: '个体咨询师',
    description: '独立执业的心理咨询师，1 人使用',
    theme: 'green',
    badgeClass: 'bg-green-100 text-green-700',
    iconBgClass: 'bg-green-100',
    iconColorClass: 'text-green-600',
    nameLabel: '执业名称',
    slugLabel: '标识 (slug)',
    adminLabel: '咨询师账号',
    namePlaceholder: '如：张老师心理工作室',
  },
  counseling: {
    badge: '机构',
    label: '专业机构',
    description: '心理咨询中心、治疗机构、EAP 服务商等多人团队',
    theme: 'blue',
    badgeClass: 'bg-blue-100 text-blue-700',
    iconBgClass: 'bg-blue-100',
    iconColorClass: 'text-blue-600',
    nameLabel: '机构名称',
    slugLabel: '机构标识 (slug)',
    adminLabel: '机构管理员',
    namePlaceholder: '如：阳光心理健康中心',
  },
  enterprise: {
    badge: '企业',
    label: '企业',
    description: '国企、央企、民企等需要 EAP 员工心理援助服务的企业或工会',
    theme: 'amber',
    badgeClass: 'bg-amber-100 text-amber-700',
    iconBgClass: 'bg-amber-100',
    iconColorClass: 'text-amber-600',
    nameLabel: '企业名称',
    slugLabel: '企业标识 (slug)',
    adminLabel: '企业管理员（HR/工会）',
    namePlaceholder: '如：中石化工会心理关爱中心',
  },
  school: {
    badge: '学校',
    label: '学校',
    description: '中小学、高校心理健康中心、学生心理辅导站',
    theme: 'teal',
    badgeClass: 'bg-teal-100 text-teal-700',
    iconBgClass: 'bg-teal-100',
    iconColorClass: 'text-teal-600',
    nameLabel: '学校名称',
    slugLabel: '学校标识 (slug)',
    adminLabel: '学校管理员',
    namePlaceholder: '如：清华大学心理健康中心',
  },
  hospital: {
    badge: '医疗',
    label: '医疗机构',
    description: '精神卫生中心、综合医院心理科、康复机构',
    theme: 'rose',
    badgeClass: 'bg-rose-100 text-rose-700',
    iconBgClass: 'bg-rose-100',
    iconColorClass: 'text-rose-600',
    nameLabel: '机构名称',
    slugLabel: '机构标识 (slug)',
    adminLabel: '机构管理员',
    namePlaceholder: '如：北京安定医院心理科',
  },
};

/**
 * Helper：给定 orgType 或任意字符串（DB 返回的原始值），拿到展示配置。
 * 未知值 fallback 到 counseling。
 */
export function getOrgTypeDisplay(orgType: string | null | undefined): OrgTypeDisplay {
  const t = orgType as OrgType;
  return ORG_TYPE_DISPLAY[t] ?? ORG_TYPE_DISPLAY.counseling;
}

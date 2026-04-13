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

export type OrgType = 'counseling' | 'enterprise' | 'school' | 'hospital';

export type OrgTypeFeature = 'eap'; // 企业 orgType 自带

/**
 * 组织类型自带功能。
 * enterprise 自动获得 EAP 能力（HR Dashboard、员工管理、危机预警等），
 * 不受 tier 限制。school 和 hospital 暂为占位。
 */
export const ORG_TYPE_FEATURES: Record<OrgType, ReadonlySet<OrgTypeFeature>> = {
  counseling: new Set(),
  enterprise: new Set(['eap']),
  school:     new Set(),
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
  counseling: '专业机构',
  enterprise: '企业',
  school:     '学校',
  hospital:   '医疗机构',
};

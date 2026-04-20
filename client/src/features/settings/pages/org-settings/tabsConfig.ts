import type React from 'react';
import {
  Building2, Users, Palette, ShieldCheck, FileSearch, Globe, Handshake, GraduationCap,
  CreditCard, User as UserIcon, BookOpen, Lock,
} from 'lucide-react';
import type { SceneVisibility } from '../../../../app/scene/visibility';

export type SettingsTab =
  | 'basic' | 'services' | 'branding'
  | 'members' | 'classes' | 'students' | 'partners'
  | 'subscription'
  | 'audit' | 'certifications'
  // Phase 14f (merged) — "我的" 分组, 人人可见的个人设置
  | 'my-basic' | 'my-counselor' | 'my-password';

export interface TabDef extends SceneVisibility {
  key: SettingsTab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  group: 'me' | 'facade' | 'org' | 'business' | 'security';
}

export const GROUP_LABELS: Record<string, string> = {
  me: '我的',
  facade: '门面信息',
  org: '组织管理',
  business: '经营信息',
  security: '安全与合规',
};

/**
 * `soloAsAdmin: true` reflects: a solo user IS the org — they should see
 * "admin" tabs like 基本信息 / 公开服务 even though their role is nominally
 * `org_admin` of a one-person org. The visibility helper special-cases this.
 */
const ADMIN_SOLO: SceneVisibility = { adminOnly: true, soloAsAdmin: true };

export const TABS: TabDef[] = [
  // 我的 (每个登录用户都能看到这一组)
  { key: 'my-basic', label: '基本资料', Icon: UserIcon, group: 'me' },
  { key: 'my-counselor', label: '咨询师档案', Icon: BookOpen, group: 'me', onlyForRoles: ['counselor', 'org_admin'] },
  { key: 'my-password', label: '修改密码', Icon: Lock, group: 'me' },
  // 门面信息
  { key: 'basic', label: '基本信息', Icon: Building2, group: 'facade' },
  { key: 'services', label: '公开服务', Icon: Globe, group: 'facade', ...ADMIN_SOLO, hideForOrgTypes: ['solo'] },
  { key: 'branding', label: '品牌定制', Icon: Palette, group: 'facade', ...ADMIN_SOLO, requiresFeature: 'branding', hideForOrgTypes: ['solo'] },
  // 组织管理
  { key: 'members', label: '成员管理', Icon: Users, group: 'org', ...ADMIN_SOLO, hideForOrgTypes: ['solo'] },
  { key: 'classes', label: '班级管理', Icon: GraduationCap, group: 'org', ...ADMIN_SOLO, onlyForOrgTypes: ['school'] },
  { key: 'students', label: '学生管理', Icon: GraduationCap, group: 'org', ...ADMIN_SOLO, onlyForOrgTypes: ['school'] },
  { key: 'partners', label: '合作机构', Icon: Handshake, group: 'org', ...ADMIN_SOLO, requiresFeature: 'partnership', hideForOrgTypes: ['solo'] },
  // 经营信息
  { key: 'subscription', label: '订阅管理', Icon: CreditCard, group: 'business' },
  // 安全与合规
  { key: 'audit', label: '审计日志', Icon: FileSearch, group: 'security', ...ADMIN_SOLO, hideForOrgTypes: ['solo'] },
  { key: 'certifications', label: '合规证书', Icon: ShieldCheck, group: 'security', ...ADMIN_SOLO, hideForOrgTypes: ['solo'] },
];

export const GROUP_ORDER = ['me', 'facade', 'org', 'business', 'security'] as const;

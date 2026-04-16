/**
 * Terminology mapping by organization type.
 *
 * Different org types use different terms for the same concepts:
 *   counseling: 咨询师 / 来访者 / 机构
 *   school:     心理老师 / 学生 / 学校
 *   enterprise: 咨询师 / 员工 / 企业
 *   hospital:   治疗师 / 患者 / 医院
 *   solo:       咨询师 / 来访者 / (无)
 */

import type { OrgType } from './tier';

const TERMS: Record<OrgType, Record<string, string>> = {
  solo: {
    practitioner: '咨询师',
    client: '来访者',
    org: '',
    orgLabel: '个人',
    settings: '个人设置',
    members: '成员',
  },
  counseling: {
    practitioner: '咨询师',
    client: '来访者',
    org: '机构',
    orgLabel: '机构',
    settings: '机构设置',
    members: '成员管理',
  },
  enterprise: {
    practitioner: '咨询师',
    client: '员工',
    org: '企业',
    orgLabel: '企业',
    settings: '企业设置',
    members: '成员管理',
  },
  school: {
    practitioner: '心理老师',
    client: '学生',
    org: '学校',
    orgLabel: '学校',
    settings: '学校设置',
    members: '教师管理',
  },
  hospital: {
    practitioner: '治疗师',
    client: '患者',
    org: '医院',
    orgLabel: '医院',
    settings: '机构设置',
    members: '成员管理',
  },
};

/**
 * Get the localized term for a concept based on organization type.
 *
 * ```ts
 * getTerm('school', 'practitioner')  // '心理老师'
 * getTerm('school', 'client')        // '学生'
 * getTerm('enterprise', 'client')    // '员工'
 * getTerm('counseling', 'org')       // '机构'
 * ```
 */
export function getTerm(orgType: OrgType | null | undefined, key: string): string {
  const type = orgType || 'counseling';
  return TERMS[type]?.[key] ?? TERMS.counseling[key] ?? key;
}

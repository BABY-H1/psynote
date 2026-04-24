/**
 * Principal 主体类型 —— 正交于 orgType,决定登录入口 + 基础界面形态。
 *
 *   staff    管理者/执业人员(走主 app):admin、督导、咨询师、班主任、心理老师…
 *   subject  服务对象本人(走 Portal 自视角):来访者、学生、员工、患者
 *   proxy    代理人/监护人(走 Portal 监护视角):家长、家属
 *
 * 一个用户在不同 org 里可以有不同 principal(同一人在 A 机构做咨询师、在 B 机构是家长)。
 */
export type Principal = 'staff' | 'subject' | 'proxy';

export const PRINCIPALS: readonly Principal[] = ['staff', 'subject', 'proxy'] as const;

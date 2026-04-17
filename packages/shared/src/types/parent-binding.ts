/**
 * Parent self-binding types — Phase 14.
 *
 * 家长通过班级邀请码自助绑定到孩子。MVP 不接微信 OAuth/小程序，沿用
 * 邮箱+密码（或 portal 自助创建账号）。详见 client-portal 的
 * `pages/ParentBindPage.tsx` 和 server `modules/parent-binding/`。
 */

export type ParentRelation = 'father' | 'mother' | 'guardian' | 'other';

export const PARENT_RELATION_LABELS: Record<ParentRelation, string> = {
  father: '父亲',
  mother: '母亲',
  guardian: '监护人',
  other: '其他',
};

export type ClientRelationshipStatus = 'active' | 'revoked';

/** 家长 ↔ 孩子 的绑定关系 */
export interface ClientRelationship {
  id: string;
  orgId: string;
  holderUserId: string;
  relatedClientUserId: string;
  relation: ParentRelation;
  status: ClientRelationshipStatus;
  boundViaTokenId?: string | null;
  acceptedAt: string;
  revokedAt?: string | null;
  createdAt: string;
}

/** 班级邀请 token 行 */
export interface ClassParentInviteToken {
  id: string;
  orgId: string;
  classId: string;
  token: string;
  createdBy: string;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
}

/** 家长扫码后落地页拿到的预览（脱敏，不含名单） */
export interface ParentBindTokenPreview {
  orgName: string;
  className: string; // e.g. "高一(3)班"
  classGrade: string; // e.g. "高一"
  expiresAt: string;
}

/** 家长在落地页提交的字段 */
export interface ParentBindRequest {
  studentName: string;
  studentNumber: string;
  phoneLast4: string; // 4 位数字
  relation: ParentRelation;
  myName: string;     // 家长自己的姓名（用作 user.name）
  password: string;   // 至少 6 位
}

/** 绑定成功后的响应 —— 与 /auth/login 的 shape 兼容 */
export interface ParentBindResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string | null;
    name: string;
    isSystemAdmin?: boolean;
  };
  orgId: string;
  /** 绑定到的孩子（用于 portal 立刻切换上下文） */
  child: {
    id: string;
    name: string;
    relation: ParentRelation;
  };
}

/** Portal "我的孩子" 列表项 —— 含孩子姓名（联表 users） */
export interface MyChildEntry {
  relationshipId: string;
  childUserId: string;
  childName: string;
  relation: ParentRelation;
  acceptedAt: string;
  status: ClientRelationshipStatus;
}

/**
 * ServiceInstance — 跨模块统一的"服务"抽象。
 *
 * 这是 psynote 重构路线图 Phase 0 引入的核心类型层，目标是把
 * 个体咨询 (care_episodes)、团辅 (group_instances)、课程 (course_instances)、
 * 测评 (assessments) 这四张完全独立的底层表，在 UI 层统一为
 * "服务实例 (Service Instance)" 这一抽象概念。
 *
 * 设计原则：
 * 1. **不迁移 DB**：四张底层表保持现状，不合并、不重命名。
 * 2. **聚合而非替换**：通过 mapper 函数把各种底层实体映射成 ServiceInstance 形状，
 *    供首页/交付中心/对象档案等跨模块视图消费。
 * 3. **代码标识符保留**：episode/groupInstance/courseInstance/assessment
 *    在代码层继续存在，只在 UI 文案和这一层共享类型上使用统一术语。
 * 4. **可辨别联合**：通过 `kind` 字段做类型收窄，让消费方按需访问特定类别的字段。
 */

import type { RiskLevel } from './enums';

/** 服务种类 */
export type ServiceKind = 'counseling' | 'group' | 'course' | 'assessment';

/**
 * 跨模块的统一状态枚举。
 *
 * 这是四种底层状态的"超集"，mapper 在转换时会把
 * `EpisodeStatus | GroupStatus | CourseInstanceStatus | AssessmentStatus`
 * 折叠到这个枚举里，例如：
 * - GroupStatus.ended → 'completed'
 * - GroupStatus.full → 'ongoing'
 * - CourseInstanceStatus.draft → 'draft'
 */
export type ServiceStatus =
  | 'draft'
  | 'active'
  | 'recruiting'
  | 'ongoing'
  | 'completed'
  | 'closed'
  | 'paused'
  | 'cancelled'
  | 'archived';

/**
 * 所有服务实例共享的公共字段。
 * 任意 kind 的 ServiceInstance 都至少包含这些信息，
 * 因此首页卡片、列表筛选、对象档案这类跨模块视图可以零分支地消费。
 */
export interface ServiceInstanceBase {
  /** 实例 ID（即底层表的主键） */
  id: string;
  /** 服务种类，可辨别联合的 discriminator */
  kind: ServiceKind;
  /** 所属机构 */
  orgId: string;
  /** UI 显示的标题（例如个案标题、团辅活动名、课程班期名） */
  title: string;
  /** 统一后的状态 */
  status: ServiceStatus;
  /** 负责人（咨询师 / 带领者 / 授课者） */
  ownerId: string;
  /** 负责人姓名（用于卡片展示，避免再查 user 表） */
  ownerName?: string;
  /** 关联的知识库资产 ID（方案/课程/量表/协议/笔记模板等） */
  assetId?: string;
  /** 资产标题 */
  assetTitle?: string;
  /** 当前参与者数量 */
  participantCount: number;
  /** 进度（已完成 / 总数），如团辅次数、课程节数 */
  progress?: { done: number; total: number };
  /** 下一次事件时间（下次面谈、下次团辅、下节课等） */
  nextSessionAt?: string;
  /** 最近一次活动时间，用于跨模块按时间排序 */
  lastActivityAt?: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/** 个体咨询实例：来自 care_episodes */
export interface CounselingServiceInstance extends ServiceInstanceBase {
  kind: 'counseling';
  clientId: string;
  clientName: string;
  /** 当前风险等级 */
  currentRisk: RiskLevel;
}

/** 团辅实例：来自 group_instances */
export interface GroupServiceInstance extends ServiceInstanceBase {
  kind: 'group';
  /** 关联团辅方案 ID */
  schemeId?: string;
  /** 容量上限 */
  capacity?: number;
}

/** 课程班期实例：来自 course_instances */
export interface CourseServiceInstance extends ServiceInstanceBase {
  kind: 'course';
  /** 关联课程 ID */
  courseId?: string;
  /** 课程类型（微课/系列/团辅/工作坊） */
  courseType?: string;
}

/** 测评实例：来自 assessments */
export interface AssessmentServiceInstance extends ServiceInstanceBase {
  kind: 'assessment';
  /** 测评类型（筛查/初评/调研/追踪） */
  assessmentType?: string;
}

/**
 * 联合类型：所有种类的 ServiceInstance。
 * 通过 `kind` 字段做类型收窄。
 */
export type ServiceInstance =
  | CounselingServiceInstance
  | GroupServiceInstance
  | CourseServiceInstance
  | AssessmentServiceInstance;

/** 参与者角色 */
export type ParticipantRole = 'client' | 'member' | 'student' | 'respondent';

/**
 * 跨模块的"参与者"统一类型。
 * - counseling: 来访者 (client)
 * - group: 团体成员 (member)
 * - course: 学员 (student)
 * - assessment: 受测者 (respondent)
 */
export interface Participant {
  userId: string;
  name: string;
  avatarUrl?: string;
  role: ParticipantRole;
}

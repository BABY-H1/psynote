import type {
  CourseEnrollmentStatus,
  CourseStatus,
  CourseType,
  TargetAudience,
  LessonBlockType,
  CourseInstanceStatus,
  CoursePublishMode,
  CourseEnrollmentSource,
  CourseApprovalStatus,
  CourseCreationMode,
  HomeworkQuestionType,
  HomeworkSubmissionStatus,
  FeedbackQuestionType,
} from './enums';

export interface Course {
  id: string;
  orgId?: string;
  title: string;
  description?: string;
  category?: string;
  coverUrl?: string;
  duration?: string;
  isPublic: boolean;
  // Lifecycle fields
  status: CourseStatus;
  courseType?: CourseType;
  targetAudience?: TargetAudience;
  scenario?: string;
  responsibleId?: string;
  isTemplate: boolean;
  sourceTemplateId?: string;
  creationMode: CourseCreationMode;
  requirementsConfig?: CourseRequirementsConfig;
  blueprintData?: CourseBlueprintData;
  tags?: string[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  chapters?: CourseChapter[];
}

export interface CourseChapter {
  id: string;
  courseId: string;
  title: string;
  content?: string;
  videoUrl?: string;
  duration?: string;
  sortOrder: number;
  relatedAssessmentId?: string;
  // Blueprint metadata
  sessionGoal?: string;
  coreConcepts?: string;
  interactionSuggestions?: string;
  homeworkSuggestion?: string;
}

export interface CourseEnrollment {
  id: string;
  courseId: string;
  userId: string;
  careEpisodeId?: string;
  assignedBy?: string;
  progress: Record<string, boolean>;
  status: CourseEnrollmentStatus;
  enrolledAt: string;
  completedAt?: string;
}

export interface CourseLessonBlock {
  id: string;
  chapterId: string;
  blockType: LessonBlockType;
  content?: string;
  sortOrder: number;
  aiGenerated: boolean;
  lastAiInstruction?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourseTemplateTag {
  id: string;
  orgId: string;
  name: string;
  color?: string;
  createdAt: string;
}

// ─── AI Course Authoring Types ─────────────────────────────────

export interface CourseRequirementsConfig {
  targetAudience?: string;       // 家长 / 学生 / 咨询师 / 教师 / 混合对象
  problemTopic?: string;         // 厌学 / 情绪管理 / 沟通冲突 / 自我认知 / 亲子关系 etc
  problemStage?: string;         // 预防期 / 早期 / 冲突拉锯 / 休学适应 / 恢复重建
  deliveryFormat?: string;       // 微课 / 系列课 / 团辅 / 工作坊 / 家长会 / 训练营
  sessionCount?: number;         // 1 / 4 / 6 / 8 / custom
  sessionDuration?: number;      // 15 / 30 / 60 / 90 minutes
  courseGoals?: string[];        // 认知提升 / 态度调整 / 技能训练 / 行为执行 / 家庭协作
  theoreticalFramework?: string; // CBT / ACT / 家庭系统 / ABA / 发展适应 / 综合
  expressionStyle?: string;      // 专业型 / 温和陪伴型 / 机构招生型 / 学校宣教型
  riskLevel?: string;            // 低风险科普 / 中风险支持 / 需谨慎表述
  // Simplified case linking
  linkedClientId?: string;
  linkedRiskLevel?: string;
  linkedChiefComplaint?: string;
}

export interface CourseBlueprintData {
  courseName: string;
  positioning: string;           // 课程定位说明
  targetDescription: string;     // 适用对象描述
  boundaries: string;            // 适用边界 / 不适用人群
  goals: string[];               // 课程目标列表
  referralAdvice?: string;       // 转介建议
  sessions: CourseBlueprintSession[];
}

export interface CourseBlueprintSession {
  title: string;
  goal: string;
  coreConcepts: string;
  interactionSuggestions: string;
  homeworkSuggestion: string;
}

// ─── Course Instance Types ──────────────────────────────────────

export interface CourseInstance {
  id: string;
  orgId: string;
  courseId: string;
  title: string;
  description?: string;
  publishMode: CoursePublishMode;
  status: CourseInstanceStatus;
  capacity?: number;
  targetGroupLabel?: string;
  responsibleId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  // Populated
  course?: Course;
  enrollmentCount?: number;
  completedCount?: number;
}

export interface CourseAttachment {
  id: string;
  chapterId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize?: number;
  sortOrder: number;
  uploadedBy?: string;
  createdAt: string;
}

// ─── Feedback & Homework Types ──────────────────────────────────

export interface FeedbackQuestion {
  id: string;
  type: FeedbackQuestionType;
  prompt: string;
  options?: string[];
  required?: boolean;
}

export interface CourseFeedbackForm {
  id: string;
  instanceId: string;
  chapterId?: string;
  title?: string;
  questions: FeedbackQuestion[];
  isActive: boolean;
  createdAt: string;
}

export interface CourseFeedbackResponse {
  id: string;
  formId: string;
  enrollmentId: string;
  answers: { questionId: string; value: string | number }[];
  submittedAt: string;
}

export interface CourseHomeworkDef {
  id: string;
  instanceId: string;
  chapterId?: string;
  title?: string;
  description?: string;
  questionType: HomeworkQuestionType;
  options?: string[];
  isRequired: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CourseHomeworkSubmission {
  id: string;
  homeworkDefId: string;
  enrollmentId: string;
  content?: string;
  selectedOptions?: string[];
  status: HomeworkSubmissionStatus;
  reviewComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  submittedAt: string;
  updatedAt: string;
}

/** Labels for block types (Chinese UI - 教案格式) */
export const LESSON_BLOCK_LABELS: Record<LessonBlockType, string> = {
  objectives: '教学目标',
  key_points: '重点难点',
  preparation: '教学准备',
  warmup: '暖身活动',
  main_activity: '主题探索',
  experience: '体验活动',
  sharing: '分享总结',
  extension: '课后延伸',
  reflection: '教学反思',
};

/** Ordered list of block types (教案顺序) */
export const LESSON_BLOCK_ORDER: LessonBlockType[] = [
  'objectives',
  'key_points',
  'preparation',
  'warmup',
  'main_activity',
  'experience',
  'sharing',
  'extension',
  'reflection',
];

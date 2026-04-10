/**
 * Phase 9α — Consumable content blocks for courses & group sessions.
 *
 * These blocks are what a learner/participant consumes inside the client portal,
 * unlike `LessonBlockType` in enums.ts which is teacher-facing outline structure.
 *
 * The type system is shared between course_content_blocks and group_session_blocks:
 * same block types, same payload shapes, same renderer components. The two tables
 * only differ in their parent foreign key (chapter vs scheme_session).
 */

// ─── Block types ────────────────────────────────────────────────────

/** 8 content block types that a client can consume in the portal. */
export type ContentBlockType =
  | 'video'      // MP4/WebM playback
  | 'audio'      // MP3/M4A — meditation, guided exercises
  | 'rich_text'  // HTML/Markdown companion text (得到武志红 style)
  | 'pdf'        // PDF download/view (worksheets to print, handouts)
  | 'quiz'       // Multi-choice scored block (incl. mini-assessments like PHQ-9)
  | 'reflection' // Open-ended prompt, learner types free-text answer
  | 'worksheet'  // Structured form with labelled fields (CBT ABC thought record, etc.)
  | 'check_in';  // Single-question mood/scale check-in

/**
 * Visibility control for a block.
 * - participant: only the learner sees it
 * - facilitator: only the group leader / therapist sees it (e.g. scripts, discussion guides)
 * - both: everyone sees it
 */
export type BlockVisibility = 'participant' | 'facilitator' | 'both';

// ─── Payload types (discriminated by blockType) ─────────────────────

export interface VideoPayload {
  /** Media reference (URL or fileRef from upload module). */
  src: string;
  /** Seconds, optional. */
  duration?: number;
  /** Optional caption/transcript. */
  caption?: string;
  /** Optional poster image URL. */
  poster?: string;
}

export interface AudioPayload {
  src: string;
  duration?: number;
  caption?: string;
  /** Mental-health audio metadata. */
  narrator?: string;
  /** e.g. 'body_scan' | 'focused_attention' | 'loving_kindness' | 'breathing' | 'pmr' */
  technique?: string;
  /** Background soundscape description. */
  backgroundSoundscape?: string;
}

export interface RichTextPayload {
  /** Stored as HTML or Markdown; renderer infers. */
  body: string;
  /** 'markdown' | 'html' — default 'html'. */
  format?: 'markdown' | 'html';
}

export interface PdfPayload {
  src: string;
  fileName?: string;
  fileSize?: number;
  /** 'view' = embedded viewer, 'download' = download-only button. */
  mode?: 'view' | 'download';
}

export interface QuizOption {
  id: string;
  label: string;
  /** Score value for scored quizzes; omit for non-scored. */
  score?: number;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  /** 'single' = radio, 'multi' = checkbox. */
  kind: 'single' | 'multi';
  options: QuizOption[];
  required?: boolean;
}

export interface QuizPayload {
  questions: QuizQuestion[];
  /** If true, sum scores and display result on submission. */
  scored?: boolean;
  /** Score cutoffs for interpretation bands. */
  scoreBands?: Array<{ minScore: number; maxScore: number; label: string; advice?: string }>;
}

export interface ReflectionPayload {
  /** Prompt shown to the learner. */
  prompt: string;
  /** Minimum character count hint (not enforced). */
  minLength?: number;
  /** Placeholder text. */
  placeholder?: string;
}

export interface WorksheetField {
  id: string;
  label: string;
  /** 'text' = single line, 'textarea' = multi-line, 'select' = dropdown, 'number' = numeric. */
  kind: 'text' | 'textarea' | 'select' | 'number';
  placeholder?: string;
  options?: string[]; // for select
  required?: boolean;
}

export interface WorksheetPayload {
  /** Optional intro text shown above the form. */
  intro?: string;
  fields: WorksheetField[];
}

export interface CheckInPayload {
  prompt: string;
  /** 'mood' = mood slider (1-5), 'scale' = numeric scale, 'text' = short free-text. */
  kind: 'mood' | 'scale' | 'text';
  min?: number;
  max?: number;
  labels?: Record<number, string>; // e.g. { 1: '很差', 5: '很好' }
}

/** Discriminated union on blockType. */
export type ContentBlockPayload =
  | { blockType: 'video'; payload: VideoPayload }
  | { blockType: 'audio'; payload: AudioPayload }
  | { blockType: 'rich_text'; payload: RichTextPayload }
  | { blockType: 'pdf'; payload: PdfPayload }
  | { blockType: 'quiz'; payload: QuizPayload }
  | { blockType: 'reflection'; payload: ReflectionPayload }
  | { blockType: 'worksheet'; payload: WorksheetPayload }
  | { blockType: 'check_in'; payload: CheckInPayload };

// ─── Block records (database-shaped) ────────────────────────────────

interface BlockRecordBase {
  id: string;
  blockType: ContentBlockType;
  visibility: BlockVisibility;
  sortOrder: number;
  payload: unknown; // Validated by blockType on read
  createdAt: string;
  updatedAt: string;
}

export interface CourseContentBlock extends BlockRecordBase {
  chapterId: string;
}

export interface GroupSessionBlock extends BlockRecordBase {
  schemeSessionId: string;
}

// ─── Enrollment response (learner answers) ──────────────────────────

/**
 * A learner's response to a block inside a specific enrollment.
 * Rows are created on first interaction; `response` may be null when the learner
 * only marks the block as "seen" (e.g. for video/audio/richText) — in that case
 * `completedAt` is set but `response` is null.
 */
export interface EnrollmentBlockResponse {
  id: string;
  enrollmentId: string;
  /** 'course' or 'group' — discriminator for which enrollment table. */
  enrollmentType: 'course' | 'group';
  blockId: string;
  blockType: ContentBlockType;
  /** Null for block-level "mark as complete" (video watched, audio listened). */
  response: unknown | null;
  completedAt: string | null;
  /** Safety scan flags for reflection/text-like blocks. */
  safetyFlags: SafetyFlag[];
  reviewedByCounselor: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyFlag {
  keyword: string;
  severity: 'info' | 'warning' | 'critical';
  snippet?: string;
}

/** Crisis resource entry returned by the server when safety scan triggers. */
export interface CrisisResource {
  name: string;
  phone: string;
  hours?: string;
  description?: string;
}

// ─── Labels & order (for UI) ────────────────────────────────────────

export const CONTENT_BLOCK_LABELS: Record<ContentBlockType, string> = {
  video: '视频',
  audio: '音频',
  rich_text: '图文',
  pdf: '文档',
  quiz: '选择题',
  reflection: '反思',
  worksheet: '工作表',
  check_in: '打卡',
};

export const CONTENT_BLOCK_ICONS: Record<ContentBlockType, string> = {
  video: 'video',
  audio: 'music',
  rich_text: 'file-text',
  pdf: 'file',
  quiz: 'check-square',
  reflection: 'message-square',
  worksheet: 'clipboard',
  check_in: 'smile',
};

export const CONTENT_BLOCK_DESCRIPTIONS: Record<ContentBlockType, string> = {
  video: '视频讲解、案例演示、微课',
  audio: '冥想引导、放松练习、音频讲解',
  rich_text: '图文稿、知识卡片、阅读材料',
  pdf: '可下载的工作表、讲义、资料',
  quiz: '选择题、量表（支持自动评分）',
  reflection: '开放式问题，学员自由书写',
  worksheet: '结构化表单（如 ABC 思维记录）',
  check_in: '心情打卡、单项量尺、短问答',
};

export const VISIBILITY_LABELS: Record<BlockVisibility, string> = {
  participant: '仅学员可见',
  facilitator: '仅带组人可见',
  both: '带组人与学员都可见',
};

/** Default visibility is 'participant' for courses, 'both' for group sessions. */
export function defaultBlockVisibility(parent: 'course' | 'group'): BlockVisibility {
  return parent === 'course' ? 'participant' : 'both';
}

/** Empty payload factory by block type — used when creating a new block. */
export function emptyPayload(blockType: ContentBlockType): unknown {
  switch (blockType) {
    case 'video':      return { src: '' } satisfies VideoPayload;
    case 'audio':      return { src: '' } satisfies AudioPayload;
    case 'rich_text':  return { body: '', format: 'html' } satisfies RichTextPayload;
    case 'pdf':        return { src: '', mode: 'view' } satisfies PdfPayload;
    case 'quiz':       return { questions: [], scored: false } satisfies QuizPayload;
    case 'reflection': return { prompt: '', minLength: 50 } satisfies ReflectionPayload;
    case 'worksheet':  return { fields: [] } satisfies WorksheetPayload;
    case 'check_in':   return { prompt: '', kind: 'mood', min: 1, max: 5 } satisfies CheckInPayload;
  }
}

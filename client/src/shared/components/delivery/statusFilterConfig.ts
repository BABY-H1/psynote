/**
 * Unified status filter configuration for all delivery center modules.
 *
 * Ensures consistent tab order, labels, and filter keys across
 * GroupCenter, CourseManagement, and AssessmentManagement.
 */

export type UnifiedFilterKey = '' | 'recruiting' | 'ongoing' | 'paused' | 'archived' | 'draft';

export interface UnifiedFilterDef {
  key: UnifiedFilterKey;
  label: string;
  kinds: Set<string>;
}

export const UNIFIED_STATUS_FILTERS: UnifiedFilterDef[] = [
  { key: '',           label: '全部',   kinds: new Set(['group', 'course', 'assessment']) },
  { key: 'recruiting', label: '招募中', kinds: new Set(['group', 'course']) },
  { key: 'ongoing',    label: '进行中', kinds: new Set(['group', 'course', 'assessment']) },
  { key: 'paused',     label: '已暂停', kinds: new Set(['group', 'course', 'assessment']) },
  { key: 'archived',   label: '已归档', kinds: new Set(['group', 'course', 'assessment']) },
  { key: 'draft',      label: '草稿',   kinds: new Set(['group', 'course', 'assessment']) },
];

/** Get filter definitions for a specific delivery module kind. */
export function getFiltersForKind(kind: 'group' | 'course' | 'assessment') {
  return UNIFIED_STATUS_FILTERS.filter((f) => f.kinds.has(kind));
}

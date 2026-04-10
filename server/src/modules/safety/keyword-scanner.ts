/**
 * Phase 9α — Keyword-based safety scanner for learner-submitted text.
 *
 * Purpose: when a learner submits a `reflection` / `worksheet` / `check_in(text)` block,
 * scan the free-text for crisis keywords (自杀 / 自残 / 想死 / ...). If any hit, we:
 *   1. Tag the response with `safetyFlags` so the counselor can see a crisis marker
 *   2. Return a "crisis resources" payload to the client portal so the learner is
 *      shown hotline information immediately
 *
 * This is an MVP implementation: static keyword list + severity tagging.
 * In the future, this can be swapped for an ML classifier without changing callers.
 */

import type { SafetyFlag, CrisisResource } from '@psynote/shared';

/**
 * Chinese crisis keywords grouped by severity.
 * - critical: explicit self-harm / suicide statements
 * - warning: hopelessness / despair that warrants a check-in
 * - info: mild signals like depression / anxiety words (not flagged by default)
 *
 * This list is intentionally minimal and conservative. Refine from the field
 * over time. Should be editable via a settings endpoint once Phase 9ε adds
 * crisis-config management.
 */
const KEYWORDS: Record<'critical' | 'warning', string[]> = {
  critical: [
    '自杀', '自殺', '自残', '自殘', '自伤', '自傷',
    '想死', '不想活', '活不下去', '结束生命', '結束生命',
    '了结自己', '了結自己', '轻生', '輕生', '寻死', '尋死',
    '割腕', '跳楼', '跳樓', '上吊',
    '我要死了', '我该死', '我該死',
  ],
  warning: [
    '绝望', '絕望', '毫无希望', '毫無希望', '没意思', '沒意思',
    '活着没意义', '活著沒意義', '没人在乎', '沒人在乎',
    '撑不住了', '撐不住了', '崩溃', '崩潰',
  ],
};

/**
 * Find the first window containing `keyword` in `text` and return a
 * short snippet around it (for counselor preview context).
 */
function extractSnippet(text: string, keyword: string, window = 20): string {
  const idx = text.indexOf(keyword);
  if (idx < 0) return '';
  const start = Math.max(0, idx - window);
  const end = Math.min(text.length, idx + keyword.length + window);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end) + suffix;
}

/**
 * Scan a single text blob and return all matching safety flags.
 * Empty array = no concerns.
 */
export function scanText(text: string): SafetyFlag[] {
  if (!text || typeof text !== 'string') return [];
  const flags: SafetyFlag[] = [];

  for (const kw of KEYWORDS.critical) {
    if (text.includes(kw)) {
      flags.push({
        keyword: kw,
        severity: 'critical',
        snippet: extractSnippet(text, kw),
      });
    }
  }
  for (const kw of KEYWORDS.warning) {
    if (text.includes(kw)) {
      // Skip warnings that were already caught as critical on the same keyword
      if (flags.some((f) => f.keyword === kw)) continue;
      flags.push({
        keyword: kw,
        severity: 'warning',
        snippet: extractSnippet(text, kw),
      });
    }
  }

  return flags;
}

/**
 * Scan an entire response object — extracts all string values and scans them.
 * Used when response payloads may be structured (worksheet answers are object-valued).
 */
export function scanResponse(response: unknown): SafetyFlag[] {
  const texts: string[] = [];

  function walk(value: unknown): void {
    if (typeof value === 'string') {
      texts.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(walk);
    }
  }

  walk(response);
  const all: SafetyFlag[] = [];
  for (const t of texts) all.push(...scanText(t));
  return all;
}

/** Highest severity in a flag array (critical > warning > info). */
export function topSeverity(flags: SafetyFlag[]): 'critical' | 'warning' | 'info' | null {
  if (flags.some((f) => f.severity === 'critical')) return 'critical';
  if (flags.some((f) => f.severity === 'warning')) return 'warning';
  if (flags.some((f) => f.severity === 'info')) return 'info';
  return null;
}

/**
 * Crisis resources shown to a learner when their response triggers a critical flag.
 * Should be configurable per org in a later phase; hardcoded defaults for now.
 * The CrisisResource type lives in @psynote/shared so the portal can also import it.
 */
export const DEFAULT_CRISIS_RESOURCES: CrisisResource[] = [
  {
    name: '北京心理危机研究与干预中心',
    phone: '010-82951332',
    hours: '24 小时',
    description: '全国范围心理援助热线',
  },
  {
    name: '希望 24 热线',
    phone: '400-161-9995',
    hours: '24 小时',
    description: '全国心理援助热线',
  },
  {
    name: '北京心理援助热线',
    phone: '010-82951332',
    hours: '24 小时',
  },
];

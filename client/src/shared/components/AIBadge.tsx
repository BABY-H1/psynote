import React from 'react';
import { Sparkles } from 'lucide-react';
import type { AIProvenance } from '@psynote/shared';

/**
 * <AIBadge /> — visible compliance marker for AI-generated content.
 *
 * Why this exists: in mental-health workflows, AI-authored output
 * (recommendations, interpretations, generated drafts) MUST be
 * visibly distinguishable from human-authored output. This badge
 * sits next to any AI-touched payload and communicates:
 *   1. "This was AI generated."
 *   2. (with provenance) which model, which pipeline, when, how
 *      confident, whether a clinician reviewed it.
 *
 * Default sizing is `sm` so the badge tucks next to a section
 * heading without dominating the layout. Use `md` when the badge
 * is the primary signal in a card header.
 *
 * Tooltip strategy: native `title` for hover + `aria-label` for
 * screen readers. We deliberately avoid a custom popover here so
 * the badge stays a leaf component (no portal, no a11y-trap).
 *
 * Test ids: rendered via `data-testid="ai-badge"` so the e2e and
 * unit tests can lock onto it deterministically.
 */
export interface AIBadgeProps {
  /**
   * Provenance metadata. If absent, the badge falls back to a
   * generic "AI 生成" label with no extra detail. This lets the
   * UI keep the safety signal even for legacy rows that haven't
   * been backfilled with provenance yet.
   */
  provenance?: AIProvenance | null;
  /** Visual size. `sm` is the default; use `md` for card headers. */
  size?: 'sm' | 'md';
  /** Layout className passthrough. */
  className?: string;
}

function buildTooltip(p: AIProvenance | null | undefined): string {
  if (!p) return 'AI 生成';
  const lines: string[] = ['AI 生成内容'];
  lines.push(`模型: ${p.aiModel}`);
  if (p.aiPipeline) lines.push(`流程: ${p.aiPipeline}`);
  if (p.aiConfidence != null) {
    lines.push(`置信度: ${Math.round(p.aiConfidence * 100)}%`);
  }
  // toLocaleString in jsdom produces a stable string for tests.
  lines.push(`生成时间: ${new Date(p.aiGeneratedAt).toLocaleString('zh-CN')}`);
  if (p.aiReviewedBy) {
    const decisionLabel =
      p.aiReviewedBy.decision === 'accepted' ? '已采纳'
      : p.aiReviewedBy.decision === 'edited' ? '已编辑后采纳'
      : '已驳回';
    lines.push(`咨询师审核: ${decisionLabel}`);
  }
  return lines.join('\n');
}

export function AIBadge({ provenance, size = 'sm', className = '' }: AIBadgeProps) {
  const tooltip = buildTooltip(provenance);

  // Reviewed → show 已审核 chip instead of plain "AI 生成" so the
  // clinician can spot at-a-glance whether a human signed off.
  const reviewed = provenance?.aiReviewedBy != null;
  const labelText = reviewed ? 'AI · 已审核' : 'AI 生成';

  const sizeCls = size === 'md'
    ? 'text-xs px-2 py-0.5 gap-1'
    : 'text-[10px] px-1.5 py-0.5 gap-0.5';
  const iconSize = size === 'md' ? 'w-3 h-3' : 'w-2.5 h-2.5';

  // Reviewed uses a slightly different palette so it's visually
  // distinguishable from raw AI output without rereading the label.
  const palette = reviewed
    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
    : 'bg-violet-100 text-violet-700 border border-violet-200';

  return (
    <span
      role="img"
      aria-label={tooltip}
      title={tooltip}
      data-testid="ai-badge"
      className={`inline-flex items-center rounded-full font-semibold whitespace-nowrap ${sizeCls} ${palette} ${className}`}
    >
      <Sparkles className={iconSize} />
      <span>{labelText}</span>
      {provenance?.aiConfidence != null && !reviewed && (
        <span className="text-violet-500/80">
          · {Math.round(provenance.aiConfidence * 100)}%
        </span>
      )}
    </span>
  );
}

import React from 'react';

/**
 * Phase 8c — SectionHeader: the small title row rendered above a section
 * within a tab page. Examples:
 *
 *   待办事项          (3)
 *   我的咨询          查看全部 →
 *   测评历史
 *
 * Mobile styling choices:
 * - Title is `text-sm font-semibold` (not headline-size) so that a tab page
 *   can stack many sections without visual overwhelm.
 * - Optional right-side slot for a secondary action ("全部" / "查看更多").
 */

interface Props {
  title: string;
  /** Optional count rendered in parens after the title */
  count?: number;
  /** Optional right-aligned action (usually a link/button) */
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, count, action, className = '' }: Props) {
  return (
    <div className={`flex items-center justify-between mb-3 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
        {title}
        {count !== undefined && count > 0 && (
          <span className="text-xs font-normal text-slate-400">({count})</span>
        )}
      </h3>
      {action}
    </div>
  );
}

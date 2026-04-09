import React from 'react';

/**
 * CardGrid — 统一的卡片网格 wrapper。
 *
 * 把"一组同类卡片"的间距和断点收拢成一个组件，避免每个列表页都
 * 各自写 `grid gap-3 md:grid-cols-2`，而且各自略有差异。
 *
 * 当前用法（Phase 4 之后）：
 *  - GroupCenter 的活动列表（4a）
 *  - CourseManagement 的课程列表（4b）
 *  - AssessmentManagement 的测评列表（4c）
 *  - DeliveryCenter 跨模块列表（Phase 5）
 *
 * 使用：
 * ```tsx
 * <CardGrid>
 *   {items.map(it => <DeliveryCard key={it.id} data={it} />)}
 * </CardGrid>
 * ```
 *
 * 默认断点：
 *  - 默认 1 列
 *  - md (≥768px) 起 2 列
 *
 * 通过 `cols` 属性可覆写为 1 / 2 / 3 / auto。
 */

export type CardGridCols = 1 | 2 | 3 | 'auto';

interface Props {
  /** 列数预设；'auto' 表示按 minmax 自适应 */
  cols?: CardGridCols;
  /** 间距类，默认 `gap-4` */
  gapClassName?: string;
  /** 是否展示为紧凑模式（gap-3），快捷方式 */
  compact?: boolean;
  className?: string;
  children: React.ReactNode;
}

const COLS_CLASS: Record<Exclude<CardGridCols, 'auto'>, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
};

export function CardGrid({ cols = 2, gapClassName, compact = false, className = '', children }: Props) {
  const gap = gapClassName || (compact ? 'gap-3' : 'gap-4');
  const colsCls =
    cols === 'auto'
      ? 'grid-cols-[repeat(auto-fill,minmax(280px,1fr))]'
      : COLS_CLASS[cols];

  return <div className={`grid ${colsCls} ${gap} ${className}`.trim()}>{children}</div>;
}

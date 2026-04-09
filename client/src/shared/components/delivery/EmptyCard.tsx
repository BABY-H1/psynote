import React from 'react';
import { Inbox } from 'lucide-react';

/**
 * EmptyCard — 卡片网格中"占位"用的空状态。
 *
 * 区别于 `shared/components/EmptyState`：后者是占据整个内容区的大型空状态，
 * 而 `EmptyCard` 是与 `<DeliveryCard />` 同样尺寸的"等高"占位，使得即便
 * 列表为空，CardGrid 的栅格也不会塌掉。
 *
 * 当前用法（Phase 4 之后）：
 *  - DeliveryCenter 跨模块列表为空时占位
 *  - GroupCenter / CourseManagement 在某种 status 筛选下为空时占位
 *
 * 与 EmptyState 的对比：
 *  - EmptyState：满宽 + 大内边距 + 居中按钮
 *  - EmptyCard：与 DeliveryCard 同样的圆角/边框/内边距，可成对出现
 */

interface Props {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  /** 强制最小高度，用于和 DeliveryCard 等高（默认 `min-h-[140px]`） */
  minHeight?: string;
}

export function EmptyCard({
  title = '暂无内容',
  description,
  icon,
  action,
  minHeight = 'min-h-[140px]',
}: Props) {
  return (
    <div
      className={`bg-white rounded-xl border border-dashed border-slate-200 p-5 flex flex-col items-center justify-center text-center ${minHeight}`}
    >
      <div className="text-slate-300 mb-2">{icon || <Inbox className="w-6 h-6" />}</div>
      <div className="text-sm font-medium text-slate-500">{title}</div>
      {description && <div className="text-xs text-slate-400 mt-1">{description}</div>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-3 text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

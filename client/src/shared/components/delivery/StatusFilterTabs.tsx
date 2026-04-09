import React from 'react';

/**
 * StatusFilterTabs — 状态筛选 tab 行（带可选计数气泡）。
 *
 * 把目前散落在多个列表页中的"状态筛选"统一为一个组件。
 *
 * 当前用法（Phase 1 + Phase 4 之后）：
 *  - DashboardHome 的 Workstation 预约管理筛选（已存在，行为完全一致）
 *  - GroupCenter 的活动状态筛选（4a，原 GroupCenter 第 81-95 行）
 *  - CourseManagement 的课程状态筛选（4b）
 *  - AssessmentManagement 的测评状态筛选（4c）
 *  - DeliveryCenter 跨模块筛选（Phase 5）
 *
 * 视觉风格：参考 GroupCenter 现有"灰色胶囊容器 + 白色选中片"的样式，
 * 因为它在视觉上比 Workstation 的纯文字 tab 更现代，迁移阻力也更小。
 *
 * 接口：
 * ```ts
 * options: { value: string; label: string; count?: number }[]
 * value:   当前选中
 * onChange:(value) => void
 * ```
 *
 * 设计原则：
 * - value 为空字符串约定为"全部"
 * - count 仅在 > 0 时显示气泡
 * - 受控组件，状态由父组件管理
 */

export interface StatusFilterOption {
  value: string;
  label: string;
  /** 可选：计数气泡。0 或 undefined 时不显示 */
  count?: number;
  /** 可选：高亮气泡颜色（默认 amber） */
  countTone?: 'amber' | 'red' | 'brand' | 'slate';
}

interface Props {
  options: StatusFilterOption[];
  value: string;
  onChange: (value: string) => void;
  /** 是否使用 GroupCenter 风格的胶囊容器（默认 true） */
  pillContainer?: boolean;
  className?: string;
}

const COUNT_TONE: Record<NonNullable<StatusFilterOption['countTone']>, string> = {
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  brand: 'bg-brand-100 text-brand-700',
  slate: 'bg-slate-100 text-slate-600',
};

export function StatusFilterTabs({
  options,
  value,
  onChange,
  pillContainer = true,
  className = '',
}: Props) {
  const inner = options.map((opt) => {
    const active = value === opt.value;
    return (
      <button
        key={opt.value || '__all__'}
        type="button"
        onClick={() => onChange(opt.value)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
          active
            ? pillContainer
              ? 'bg-white text-slate-900 shadow-sm'
              : 'bg-brand-600 text-white'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <span>{opt.label}</span>
        {opt.count !== undefined && opt.count > 0 && (
          <span
            className={`inline-flex items-center justify-center rounded-full text-[10px] font-medium leading-none px-1.5 py-0.5 ${
              COUNT_TONE[opt.countTone || 'amber']
            }`}
          >
            {opt.count}
          </span>
        )}
      </button>
    );
  });

  if (pillContainer) {
    return (
      <div className={`inline-flex gap-1 bg-slate-100 rounded-lg p-0.5 ${className}`.trim()}>
        {inner}
      </div>
    );
  }
  return <div className={`flex gap-1 ${className}`.trim()}>{inner}</div>;
}

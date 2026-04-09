import React from 'react';
import type { ServiceKind, ServiceStatus } from '@psynote/shared';

/**
 * DeliveryCard — 跨模块统一的"服务实例卡片"。
 *
 * 这是 Phase 2 抽取的最重要的组件，所有交付类列表（个案 / 团辅 / 课程 / 测评）
 * 在 Phase 4 之后都改用它，让 4 套近似的卡片视觉收敛成一套。
 *
 * 当前用法（Phase 4 之后）：
 *  - GroupCenter 团辅活动列表（4a，原 GroupCenter 第 109-160 行）
 *  - CourseManagement 课程列表（4b）
 *  - AssessmentManagement 测评列表（4c）
 *  - CaseWorkbench 个案列表（4d）
 *  - DeliveryCenter 跨模块列表（Phase 5）
 *
 * 设计要点：
 * 1. **UI 形状**：`DeliveryCardData` 是一个 UI 友好的最小形状（id/kind/title/status
 *    + 可选的 description/meta）。它**与 ServiceInstance 的核心字段子集兼容**，
 *    但额外允许两个 UI-only 字段，因此调用方可以这样传：
 *    ```tsx
 *    <DeliveryCard data={{
 *      id: si.id, kind: si.kind, title: si.title, status: si.status,
 *      description: '...', meta: [...],
 *    }} />
 *    ```
 *    Phase 5 mapper 层会提供把 ServiceInstance → DeliveryCardData 的 helper。
 * 2. **图标按 kind 自动选择**：counseling/group/course/assessment 各有默认色调，
 *    也可通过 `icon` 覆盖。
 * 3. **操作按钮区是 slot**：通过 `actions` prop 注入，每个模块自定义哪些动作可用。
 * 4. **卡片整体是按钮**：点卡片正文→ `onOpen`；点 actions 区域→ stopPropagation。
 *
 * 卡片结构：
 * ```
 * ┌────────────────────────────────────────┐
 * │ [icon] 标题 [状态徽章]    [actions...]│
 * │ 描述（可选，2 行截断）                 │
 * │ • meta1   • meta2   • meta3            │
 * └────────────────────────────────────────┘
 * ```
 */

/**
 * 卡片可消费的 UI 形状。与 `ServiceInstanceBase` 的核心字段子集兼容
 * （id / kind / title / status），并允许 UI-only 的 description / meta。
 */
export interface DeliveryCardData {
  id: string;
  kind: ServiceKind;
  title: string;
  status: ServiceStatus;
  description?: string;
  /** 元数据徽章列表，例如开始时间/容量/参与者数 */
  meta?: Array<{ label: string; value?: string | number } | string>;
}

/** 状态徽章颜色方案；与 GroupInstanceDetail / GroupCenter 现有方案保持一致 */
const STATUS_TONE: Record<ServiceStatus, { text: string; cls: string }> = {
  draft: { text: '草稿', cls: 'bg-slate-100 text-slate-600' },
  active: { text: '活跃', cls: 'bg-blue-100 text-blue-700' },
  recruiting: { text: '招募中', cls: 'bg-green-100 text-green-700' },
  ongoing: { text: '进行中', cls: 'bg-blue-100 text-blue-700' },
  completed: { text: '已完成', cls: 'bg-slate-100 text-slate-500' },
  closed: { text: '已结束', cls: 'bg-slate-100 text-slate-500' },
  paused: { text: '已暂停', cls: 'bg-yellow-100 text-yellow-700' },
  cancelled: { text: '已取消', cls: 'bg-rose-100 text-rose-700' },
  archived: { text: '已归档', cls: 'bg-slate-100 text-slate-400' },
};

/** kind 对应的默认色调（影响图标圆形背景） */
const KIND_TONE: Record<ServiceKind, { bg: string; text: string }> = {
  counseling: { bg: 'bg-brand-50', text: 'text-brand-600' },
  group: { bg: 'bg-amber-50', text: 'text-amber-600' },
  course: { bg: 'bg-purple-50', text: 'text-purple-600' },
  assessment: { bg: 'bg-cyan-50', text: 'text-cyan-600' },
};

interface Props {
  /** 数据：UI 形状。从 ServiceInstance 转换的 helper 见 Phase 5 mapper */
  data: DeliveryCardData;
  /** 点击卡片正文（标题区）的回调 */
  onOpen?: () => void;
  /** 操作按钮 slot — 出现在卡片右侧，独立可点击区 */
  actions?: React.ReactNode;
  /** 显式传入图标元素，覆盖默认 kind 图标 */
  icon?: React.ReactNode;
  /** 自定义状态文案，覆盖默认映射 */
  statusText?: string;
  /** 自定义状态徽章 className，覆盖默认映射 */
  statusClassName?: string;
  className?: string;
}

export function DeliveryCard({
  data,
  onOpen,
  actions,
  icon,
  statusText,
  statusClassName,
  className = '',
}: Props) {
  const tone = KIND_TONE[data.kind];
  const statusTone = STATUS_TONE[data.status] || STATUS_TONE.draft;
  const meta = data.meta ?? [];

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 hover:shadow-sm hover:border-slate-300 transition flex p-5 ${className}`.trim()}
    >
      {/* Icon */}
      <div
        className={`w-9 h-9 ${tone.bg} ${tone.text} rounded-lg flex items-center justify-center flex-shrink-0 mr-3`}
      >
        {icon ?? <KindIcon kind={data.kind} />}
      </div>

      {/* Body — clickable to open */}
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="flex-1 min-w-0 text-left disabled:cursor-default"
      >
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-900 truncate">{data.title}</h3>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusClassName ?? statusTone.cls}`}
          >
            {statusText ?? statusTone.text}
          </span>
        </div>
        {data.description && (
          <p className="text-sm text-slate-500 mt-1 line-clamp-2">{data.description}</p>
        )}
        {meta && meta.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
            {meta.map((m, i) => {
              if (typeof m === 'string') return <span key={i}>{m}</span>;
              return (
                <span key={i}>
                  {m.label}
                  {m.value !== undefined && (
                    <>
                      : <span className="text-slate-600">{m.value}</span>
                    </>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </button>

      {/* Actions slot */}
      {actions && (
        <div
          className="flex gap-1 ml-4 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

/** 默认按 kind 渲染的简单图标（用 SVG 字形避免引入额外 lucide 依赖差异） */
function KindIcon({ kind }: { kind: ServiceKind }) {
  const path = ICON_PATHS[kind];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

const ICON_PATHS: Record<ServiceKind, string> = {
  // counseling — Activity wave
  counseling: 'M22 12h-4l-3 9L9 3l-3 9H2',
  // group — Layers
  group: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  // course — Book open
  course:
    'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z',
  // assessment — ClipboardList
  assessment:
    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h6',
};

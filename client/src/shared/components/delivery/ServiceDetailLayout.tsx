import React from 'react';
import { ArrowLeft } from 'lucide-react';
import type { ServiceStatus } from '@psynote/shared';

/**
 * ServiceDetailLayout — 详情页统一外壳（双 variant）。
 *
 * 这是 Phase 2 最关键的复合组件之一。它把 4 个交付模块的详情页头部
 * (返回按钮 / 标题 / 状态 pill / 操作按钮区) 收敛为一套 chrome,
 * 同时通过双 variant 兼容两种内容布局：
 *
 *   variant="tabs"      —— Groups / Courses / Assessment 用，渲染 ServiceTabBar + 内容
 *   variant="workspace" —— Counseling 用，原样保留 3 列 WorkspaceLayout，零侵入
 *
 * 当前用法（Phase 4 之后）：
 *  - GroupInstanceDetail 的头部 + tab 框架（4a，原 GroupInstanceDetail 第 56-119 行）
 *  - CourseInstanceDetail 的头部 + tab 框架（4b）
 *  - AssessmentDetail 的头部 + tab 框架（4c）
 *  - EpisodeDetail 的头部框架（4d，仅头部，主体 workspace 不变）
 *
 * 设计要点：
 * 1. 两个 variant 共享相同的头部 chrome
 * 2. variant="workspace" 不渲染 tab 区，主体直接 children（让模块自己挂 WorkspaceLayout）
 * 3. status pill 的颜色映射来自 DeliveryCard 的 STATUS_TONE，但本组件接受 statusOverride 完全自定义
 */

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

interface CommonProps {
  /** 标题（个案标题 / 团辅活动名 / 课程班期名 / 测评名） */
  title: string;
  /** 状态 — 决定 pill 颜色和文案 */
  status?: ServiceStatus;
  /** 自定义状态文案，优先级高于默认映射 */
  statusText?: string;
  /** 自定义状态 className，优先级高于默认映射 */
  statusClassName?: string;
  /** 标题下方的元数据行（如开始时间/地点/容量） */
  metaLine?: React.ReactNode;
  /** 返回按钮回调；不传则不渲染返回按钮 */
  onBack?: () => void;
  /** 头部右侧的操作按钮区 */
  actions?: React.ReactNode;
  className?: string;
}

interface TabsVariantProps extends CommonProps {
  variant?: 'tabs';
  /** tab 行节点，通常是 `<ServiceTabBar />` */
  tabBar: React.ReactNode;
  /** 当前 tab 的内容 */
  children: React.ReactNode;
}

interface WorkspaceVariantProps extends CommonProps {
  variant: 'workspace';
  /** workspace 主体节点，通常是 `<WorkspaceLayout left center right />` */
  children: React.ReactNode;
  /** workspace variant 不接受 tabBar */
  tabBar?: never;
}

type Props = TabsVariantProps | WorkspaceVariantProps;

export function ServiceDetailLayout(props: Props) {
  const {
    title,
    status,
    statusText,
    statusClassName,
    metaLine,
    onBack,
    actions,
    className = '',
    children,
  } = props;
  const tone = status ? STATUS_TONE[status] : null;

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-slate-400 hover:text-slate-600 flex-shrink-0"
              aria-label="返回"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 truncate">{title}</h2>
              {(tone || statusText) && (
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                    statusClassName ?? tone?.cls ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {statusText ?? tone?.text}
                </span>
              )}
            </div>
            {metaLine && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-slate-500">
                {metaLine}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex gap-2 ml-4 shrink-0">{actions}</div>}
      </div>

      {/* Body */}
      {props.variant === 'workspace' ? (
        // Workspace variant — caller renders WorkspaceLayout, no tab bar
        <>{children}</>
      ) : (
        // Tabs variant
        <>
          {props.tabBar && <div className="mb-6">{props.tabBar}</div>}
          {children}
        </>
      )}
    </div>
  );
}

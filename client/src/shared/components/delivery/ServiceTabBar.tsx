import React from 'react';
import { LayoutDashboard, Users, ListChecks, FileText, Package } from 'lucide-react';

/**
 * ServiceTabBar — 5 个标准 tab 的统一 tab 行。
 *
 * 来源于路线图第 5 节"详情页 Tab 术语"统一规范，把 Groups/Courses/Assessment
 * 三个模块的详情 tab 收敛成一套同构结构，支持 `visibleTabs` 隐藏不需要的。
 *
 * 当前用法（Phase 4 之后）：
 *  - GroupInstanceDetail 的 tab 行（4a，原 GroupInstanceDetail 第 104-119 行）
 *  - CourseInstanceDetail 的 tab 行（4b）
 *  - AssessmentDetail 的 tab 行（4c）
 *  - counseling 的 EpisodeDetail 仍然走 workspace variant，不渲染本组件
 *
 * 5 个标准 tab：
 *  - overview     总览
 *  - participants 参与者
 *  - timeline     时间线
 *  - records      记录
 *  - assets       资产
 *
 * 通过 `visibleTabs` 控制显示哪些；`labels` 可覆写中文文案，
 * 例如团辅可叫"成员"，课程可叫"学员"，测评可叫"受测者"。
 */

export type ServiceTab = 'overview' | 'participants' | 'timeline' | 'records' | 'assets';

const DEFAULT_TABS: ServiceTab[] = ['overview', 'participants', 'timeline', 'records', 'assets'];

const DEFAULT_LABEL: Record<ServiceTab, string> = {
  overview: '总览',
  participants: '参与者',
  timeline: '时间线',
  records: '记录',
  assets: '资产',
};

const DEFAULT_ICON: Record<ServiceTab, React.ReactNode> = {
  overview: <LayoutDashboard className="w-4 h-4" />,
  participants: <Users className="w-4 h-4" />,
  timeline: <ListChecks className="w-4 h-4" />,
  records: <FileText className="w-4 h-4" />,
  assets: <Package className="w-4 h-4" />,
};

interface Props {
  /** 当前选中的 tab */
  value: ServiceTab;
  /** 切换回调 */
  onChange: (tab: ServiceTab) => void;
  /**
   * 显示哪些 tab。默认全部 5 个；assessment 通常传
   * `['overview', 'timeline', 'records']`，counseling 不使用本组件。
   */
  visibleTabs?: ServiceTab[];
  /** 文案覆写：例如把 'participants' 改为"成员" / "学员" / "受测者" */
  labels?: Partial<Record<ServiceTab, string>>;
  /** 图标覆写 */
  icons?: Partial<Record<ServiceTab, React.ReactNode>>;
  className?: string;
}

export function ServiceTabBar({
  value,
  onChange,
  visibleTabs,
  labels,
  icons,
  className = '',
}: Props) {
  const tabs = (visibleTabs ?? DEFAULT_TABS).filter((t) => DEFAULT_TABS.includes(t));

  return (
    <div className={`flex gap-1 bg-slate-100 rounded-xl p-1 ${className}`.trim()}>
      {tabs.map((t) => {
        const active = value === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
              active
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {icons?.[t] ?? DEFAULT_ICON[t]}
            {labels?.[t] ?? DEFAULT_LABEL[t]}
          </button>
        );
      })}
    </div>
  );
}

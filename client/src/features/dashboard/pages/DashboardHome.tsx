import React from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { DashboardCountGrid } from '../components/DashboardCountGrid';
import { TodayTimeline } from '../components/TodayTimeline';
import { Workstation } from '../components/Workstation';
import { ActionQueue } from '../components/ActionQueue';

/**
 * 咨询师首页 —— 顶部 CountGrid + 下方三列。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │ DashboardCountGrid                                    │
 * ├────────────────┬────────────────┬────────────────────┤
 * │ TodayTimeline  │ Workstation    │ ActionQueue        │
 * │ (今日时间线)    │ (预约管理/排班) │ (需要处理)         │
 * └────────────────┴────────────────┴────────────────────┘
 *
 * 设计目标：首屏 10 秒内能识别"今天有几场 / 下一场是谁 / 憋着的事"。
 * - col-1 今日时间线：只看当日时轴，当前时刻标线，已过去 dim
 * - col-2 预约管理：全量按日期分组，可状态筛选；"排班设置"就地展开
 * - col-3 需要处理：合并原 FollowUpAlerts 的 4 类规则（待确认预约 /
 *   过期未写笔记 / 高风险未跟进 / 测评分数上升）
 *
 * 整页不滚动：每列内部自己 overflow-auto。
 */
export function DashboardHome() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {/* 欢迎 */}
      <div className="flex items-baseline gap-3 flex-wrap flex-shrink-0">
        <h1 className="text-xl font-bold text-slate-900">
          你好，{user?.name || '咨询师'}
        </h1>
        <p className="text-sm text-slate-500">今日工作看板</p>
      </div>

      {/* 看板 */}
      <DashboardCountGrid />

      {/* 三列主区 */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="min-h-0 flex">
          <TodayTimeline />
        </div>
        <div className="min-h-0 flex">
          <Workstation />
        </div>
        <div className="min-h-0 flex">
          <ActionQueue />
        </div>
      </div>
    </div>
  );
}

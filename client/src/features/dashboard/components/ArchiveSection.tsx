import React from 'react';
import { RecentInteractions } from './RecentInteractions';
import { FollowUpAlerts } from './FollowUpAlerts';
import { PersonArchivePreview } from './PersonArchivePreview';

/**
 * 档案库 · 过去
 *
 * 首页三段式中的"档案库"段，承载历史轨迹与跟进提醒。
 *
 * Phase 6 之后这里同时呈现两种视角：
 *  - 左列上：PersonArchivePreview（按"对象"维度的来访者档案 top 5，Phase 6）
 *  - 左列下：RecentInteractions（按"服务"维度的最近活跃实例，Phase 1）
 *  - 右列  ：FollowUpAlerts（需要跟进的告警，Phase 1）
 *
 * 两种视角互补 — Person 是 who 维度，Recent 是 what 维度。
 */
export function ArchiveSection() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <div className="space-y-4">
        <PersonArchivePreview />
        <RecentInteractions />
      </div>
      <FollowUpAlerts />
    </div>
  );
}

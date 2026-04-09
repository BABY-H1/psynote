import React, { useState } from 'react';
import { useGroupInstance, useUpdateGroupInstance } from '../../../api/useGroups';
import {
  PageLoading,
  useToast,
  ServiceDetailLayout,
  ServiceTabBar,
  type ServiceTab,
} from '../../../shared/components';
import type { GroupInstance, ServiceStatus } from '@psynote/shared';
import { OverviewTab } from './detail/OverviewTab';
import { MembersTab } from './detail/MembersTab';
import { SessionsTab } from './detail/SessionsTab';
import { ReportsTab } from './detail/ReportsTab';

/**
 * Phase 4a — GroupInstanceDetail migrated to Phase 2 shared components.
 *
 * Visual & behavioural changes from the previous version:
 *  - Header (back button / title / status pill / action buttons) is now provided
 *    by `<ServiceDetailLayout variant="tabs">`.
 *  - Tab bar uses `<ServiceTabBar>` with the 5 standard tabs, but only the 4 we
 *    need are passed via `visibleTabs` (no "资产" tab in groups yet).
 *  - Tab labels are localized via `labels`: 参与者 → 成员.
 *  - "full" status keeps its yellow "已满" label via the layout's `statusText`
 *    and `statusClassName` overrides.
 *
 * Behaviour preserved:
 *  - Status transition buttons (开始招募 / 开始活动 / 结束活动)
 *  - Tab content components (OverviewTab / MembersTab / SessionsTab / ReportsTab)
 *    are slotted in unchanged
 *  - Each existing tab key is mapped onto the standard ServiceTab namespace:
 *      overview → overview
 *      members  → participants
 *      sessions → timeline
 *      reports  → records
 */

const VISIBLE_TABS: ServiceTab[] = ['overview', 'participants', 'timeline', 'records'];
const TAB_LABELS: Partial<Record<ServiceTab, string>> = {
  participants: '成员',
  timeline: '活动记录',
  records: '效果报告',
};

function mapGroupStatus(s: GroupInstance['status']): ServiceStatus {
  switch (s) {
    case 'draft':
      return 'draft';
    case 'recruiting':
      return 'recruiting';
    case 'ongoing':
      return 'ongoing';
    case 'full':
      return 'ongoing';
    case 'ended':
      return 'completed';
    default:
      return 'draft';
  }
}

interface Props {
  instanceId: string;
  onClose: () => void;
}

export function GroupInstanceDetail({ instanceId, onClose }: Props) {
  const { data: instance, isLoading } = useGroupInstance(instanceId);
  const updateInstance = useUpdateGroupInstance();
  const { toast } = useToast();
  const [tab, setTab] = useState<ServiceTab>('overview');

  if (isLoading || !instance) return <PageLoading text="加载活动详情..." />;

  const handleStatusChange = (newStatus: string) => {
    updateInstance.mutate({ instanceId, status: newStatus }, {
      onSuccess: () => {
        const labels: Record<string, string> = {
          recruiting: '已开始招募',
          ongoing: '活动已开始',
          ended: '活动已结束',
        };
        toast(labels[newStatus] || '状态已更新', 'success');
      },
    });
  };

  return (
    <ServiceDetailLayout
      title={instance.title}
      status={mapGroupStatus(instance.status)}
      statusText={instance.status === 'full' ? '已满' : undefined}
      statusClassName={instance.status === 'full' ? 'bg-yellow-100 text-yellow-700' : undefined}
      metaLine={
        <>
          {instance.startDate && <span>开始: {instance.startDate}</span>}
          {instance.location && <span>地点: {instance.location}</span>}
          {instance.capacity && <span>容量: {instance.capacity}人</span>}
        </>
      }
      onBack={onClose}
      actions={
        <>
          {instance.status === 'draft' && (
            <button
              onClick={() => handleStatusChange('recruiting')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500"
            >
              开始招募
            </button>
          )}
          {instance.status === 'recruiting' && (
            <button
              onClick={() => handleStatusChange('ongoing')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500"
            >
              开始活动
            </button>
          )}
          {instance.status === 'ongoing' && (
            <button
              onClick={() => handleStatusChange('ended')}
              className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-500"
            >
              结束活动
            </button>
          )}
        </>
      }
      tabBar={
        <ServiceTabBar
          value={tab}
          onChange={setTab}
          visibleTabs={VISIBLE_TABS}
          labels={TAB_LABELS}
        />
      }
    >
      {tab === 'overview' && <OverviewTab instance={instance} />}
      {tab === 'participants' && <MembersTab instance={instance} />}
      {tab === 'timeline' && <SessionsTab instance={instance} />}
      {tab === 'records' && <ReportsTab instance={instance} />}
    </ServiceDetailLayout>
  );
}

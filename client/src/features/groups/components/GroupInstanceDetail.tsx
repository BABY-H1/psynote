import React, { useState } from 'react';
import { useGroupInstance, useUpdateGroupInstance } from '../../../api/useGroups';
import { ArrowLeft, LayoutDashboard, Users, ListChecks, BarChart3 } from 'lucide-react';
import { PageLoading, useToast } from '../../../shared/components';
import { OverviewTab } from './detail/OverviewTab';
import { MembersTab } from './detail/MembersTab';
import { SessionsTab } from './detail/SessionsTab';
import { ReportsTab } from './detail/ReportsTab';

const statusLabels: Record<string, { text: string; color: string }> = {
  draft: { text: '草稿', color: 'bg-slate-100 text-slate-600' },
  recruiting: { text: '招募中', color: 'bg-green-100 text-green-700' },
  ongoing: { text: '进行中', color: 'bg-blue-100 text-blue-700' },
  full: { text: '已满', color: 'bg-yellow-100 text-yellow-700' },
  ended: { text: '已结束', color: 'bg-slate-100 text-slate-500' },
};

type TabType = 'overview' | 'members' | 'sessions' | 'reports';

const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: '概览', icon: <LayoutDashboard className="w-4 h-4" /> },
  { key: 'members', label: '成员', icon: <Users className="w-4 h-4" /> },
  { key: 'sessions', label: '活动记录', icon: <ListChecks className="w-4 h-4" /> },
  { key: 'reports', label: '效果报告', icon: <BarChart3 className="w-4 h-4" /> },
];

interface Props {
  instanceId: string;
  onClose: () => void;
}

export function GroupInstanceDetail({ instanceId, onClose }: Props) {
  const { data: instance, isLoading } = useGroupInstance(instanceId);
  const updateInstance = useUpdateGroupInstance();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabType>('overview');

  if (isLoading || !instance) return <PageLoading text="加载活动详情..." />;

  const st = statusLabels[instance.status] || statusLabels.draft;

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
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">{instance.title}</h2>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${st.color}`}>{st.text}</span>
            </div>
            <div className="flex gap-4 mt-1 text-sm text-slate-500">
              {instance.startDate && <span>开始: {instance.startDate}</span>}
              {instance.location && <span>地点: {instance.location}</span>}
              {instance.capacity && <span>容量: {instance.capacity}人</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && <OverviewTab instance={instance} />}
      {tab === 'members' && <MembersTab instance={instance} />}
      {tab === 'sessions' && <SessionsTab instance={instance} />}
      {tab === 'reports' && <ReportsTab instance={instance} />}
    </div>
  );
}

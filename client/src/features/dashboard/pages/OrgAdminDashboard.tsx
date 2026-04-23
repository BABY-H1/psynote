/**
 * 机构管理员首页 —— 重设计版。
 *
 * 第一性原理：打开首页的 10 秒内识别"有没有事卡在我这里 + 本月运营比上月如何"。
 *
 *  ┌────────────────────────────────────────────────────┐
 *  │ 欢迎标语                                            │
 *  │ 5 KPIDelta (本月新增来访者 / 个咨 / 进行中团辅 /   │
 *  │             进行中课程 / 本月测评 —— 均带环比)     │
 *  ├──────────────────────────────┬─────────────────────┤
 *  │ 待分配来访者 action card     │ 最近通知 列表        │
 *  │ （唯一真正跑通的决策队列）   │ （内部滚动）         │
 *  └──────────────────────────────┴─────────────────────┘
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus, Calendar, UsersRound, BookOpen, ClipboardCheck,
  AlertTriangle, Bell,
} from 'lucide-react';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { useDashboardStats, useDashboardKpiDelta } from '../../../api/useDashboard';
import { KPIDelta } from '../../../shared/components/dashboard';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
  refType?: string;
  refId?: string;
}

function useRecentNotifications() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['notifications', orgId],
    queryFn: () => api.get<Notification[]>(`/orgs/${orgId}/notifications`),
    enabled: !!orgId,
  });
}

export function OrgAdminDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: delta, isLoading: deltaLoading } = useDashboardKpiDelta();
  const { data: notifications = [] } = useRecentNotifications();

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      {/* 欢迎 */}
      <div className="flex items-baseline gap-3 flex-wrap flex-shrink-0">
        <h1 className="text-xl font-bold text-slate-900">
          你好，{user?.name || '管理员'}
        </h1>
        <p className="text-sm text-slate-500">机构运营概览</p>
      </div>

      {/* 5 核心 KPI 环比 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPIDelta
          icon={<UserPlus className="w-4 h-4" />}
          tone="blue"
          label="本月新增来访者"
          current={delta?.newClient.current}
          previous={delta?.newClient.previous}
          suffix="人"
          loading={deltaLoading}
        />
        <KPIDelta
          icon={<Calendar className="w-4 h-4" />}
          tone="violet"
          label="本月个咨"
          current={delta?.session.current}
          previous={delta?.session.previous}
          suffix="场"
          loading={deltaLoading}
        />
        <KPIDelta
          icon={<UsersRound className="w-4 h-4" />}
          tone="orange"
          label="进行中团辅"
          current={delta?.groupActive.current}
          previous={delta?.groupActive.previous}
          suffix="个"
          loading={deltaLoading}
          onClick={() => navigate('/delivery?type=group')}
        />
        <KPIDelta
          icon={<BookOpen className="w-4 h-4" />}
          tone="teal"
          label="进行中课程"
          current={delta?.courseActive.current}
          previous={delta?.courseActive.previous}
          suffix="个"
          loading={deltaLoading}
          onClick={() => navigate('/delivery?type=course')}
        />
        <KPIDelta
          icon={<ClipboardCheck className="w-4 h-4" />}
          tone="indigo"
          label="本月测评"
          current={delta?.assessment.current}
          previous={delta?.assessment.previous}
          suffix="份"
          loading={deltaLoading}
        />
      </div>

      {/* 待分配动作卡 + 最近通知 */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 min-h-0 flex">
          <UnassignedCard
            count={stats?.unassignedCount ?? 0}
            loading={statsLoading}
            onClick={() => navigate('/collaboration')}
          />
        </div>

        <div className="lg:col-span-2 min-h-0 flex">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col w-full min-h-0">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h3 className="text-base font-bold text-slate-900">最近通知</h3>
              <Bell className="w-4 h-4 text-slate-400" />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
              {notifications.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-slate-400">
                  暂无通知
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className={`p-2.5 flex items-start gap-2.5 ${!n.isRead ? 'bg-blue-50/40' : ''}`}
                    >
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.isRead ? 'bg-blue-500' : 'bg-transparent'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-800 font-medium truncate">{n.title}</div>
                        {n.body && (
                          <div className="text-xs text-slate-500 mt-0.5 truncate">{n.body}</div>
                        )}
                        <div className="text-xs text-slate-400 mt-1">
                          {new Date(n.createdAt).toLocaleString('zh-CN')}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface UnassignedCardProps {
  count: number;
  loading: boolean;
  onClick: () => void;
}

function UnassignedCard({ count, loading, onClick }: UnassignedCardProps) {
  const hasItems = count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col w-full rounded-xl border p-4 text-left transition ${
        hasItems
          ? 'bg-amber-50 border-amber-200 hover:border-amber-300'
          : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`p-2 rounded-lg ${hasItems ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
          <AlertTriangle className="w-4 h-4" />
        </span>
        {hasItems && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
            等待派单
          </span>
        )}
      </div>
      <div className={`text-3xl font-bold leading-tight ${hasItems ? 'text-amber-700' : 'text-slate-400'}`}>
        {loading ? '—' : count}
      </div>
      <div className={`text-sm font-medium mt-1 ${hasItems ? 'text-amber-700' : 'text-slate-600'}`}>
        待分配来访者
      </div>
      <div className="text-xs text-slate-400 mt-1">
        {hasItems
          ? '点击进入协作中心 · 派单 Tab 处理'
          : '无待派单 · 所有来访者均已分配咨询师'}
      </div>
      <div className="flex-1" />
    </button>
  );
}

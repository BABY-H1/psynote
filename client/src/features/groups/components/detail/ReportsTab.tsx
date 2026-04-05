import React from 'react';
import { BarChart3, ClipboardCheck, TrendingUp } from 'lucide-react';
import type { GroupInstance, GroupEnrollment } from '@psynote/shared';

interface Props {
  instance: GroupInstance & { enrollments: (GroupEnrollment & { user: { name: string; email: string } })[] };
}

export function ReportsTab({ instance }: Props) {
  const overallAssessments = (instance as any).overallAssessments || [];
  const hasOverall = overallAssessments.length > 0;

  return (
    <div className="space-y-6">
      {/* Assessment Status */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardCheck className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-900">评估量表状态</h3>
        </div>

        {hasOverall ? (
          <div className="space-y-2">
            {overallAssessments.map((id: string, i: number) => (
              <div key={id} className="flex items-center justify-between rounded-lg p-3 bg-green-50 border border-green-200">
                <div>
                  <p className="text-sm font-medium text-slate-900">整体评估量表 {i + 1}</p>
                  <p className="text-xs text-slate-500">ID: {id.slice(0, 8)}...</p>
                </div>
                <span className="text-xs text-green-600 font-medium">已配置</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg p-4 bg-slate-50 border border-slate-200 text-center">
            <p className="text-sm text-slate-500">未配置整体评估量表</p>
            <p className="text-xs text-slate-400 mt-1">请在创建活动时配置，用于纵向追踪效果</p>
          </div>
        )}
      </div>

      {/* Report Generation */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-slate-900">效果报告</h3>
        </div>

        {!hasOverall ? (
          <div className="text-center py-8">
            <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 mb-1">请先配置整体评估量表</p>
            <p className="text-xs text-slate-400">
              配置后，系统将在每个评估节点自动收集数据，用于生成纵向对比报告
            </p>
          </div>
        ) : instance.status !== 'ended' ? (
          <div className="text-center py-8">
            <TrendingUp className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 mb-1">活动进行中</p>
            <p className="text-xs text-slate-400">
              各评估节点的数据将在活动记录中以单次报告呈现。活动结束后可在此生成完整的纵向对比报告。
            </p>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-slate-600 mb-3">
              活动已结束，可以生成团体效果报告
            </p>
            <button
              className="px-5 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500"
            >
              生成纵向对比报告
            </button>
            <p className="text-xs text-slate-400 mt-2">
              将对比各评估节点的数据，显示变化轨迹、团体统计和个体差异
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import React from 'react';
import { BarChart3, ClipboardCheck } from 'lucide-react';
import type { GroupInstance, GroupEnrollment } from '@psynote/shared';

interface Props {
  instance: GroupInstance & { enrollments: (GroupEnrollment & { user: { name: string; email: string } })[] };
}

export function ReportsTab({ instance }: Props) {
  const hasPre = !!instance.preAssessmentId;
  const hasPost = !!instance.postAssessmentId;
  const hasBoth = hasPre && hasPost;

  return (
    <div className="space-y-6">
      {/* Assessment Status */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardCheck className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-900">前后测状态</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-lg p-4 ${hasPre ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'}`}>
            <p className="text-xs text-slate-500 mb-1">前测</p>
            <p className="text-sm font-medium text-slate-900">
              {hasPre ? '已绑定' : '未设置'}
            </p>
          </div>
          <div className={`rounded-lg p-4 ${hasPost ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'}`}>
            <p className="text-xs text-slate-500 mb-1">后测</p>
            <p className="text-sm font-medium text-slate-900">
              {hasPost ? '已绑定' : '未设置'}
            </p>
          </div>
        </div>
      </div>

      {/* Report Generation */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-slate-900">效果报告</h3>
        </div>

        {!hasBoth ? (
          <div className="text-center py-8">
            <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 mb-1">
              {!hasPre && !hasPost
                ? '请先在概览页面绑定前测和后测量表'
                : !hasPre
                ? '请先绑定前测量表'
                : '请先绑定后测量表'}
            </p>
            <p className="text-xs text-slate-400">
              绑定前后测后，活动结束时可生成效果对比报告
            </p>
          </div>
        ) : instance.status !== 'ended' ? (
          <div className="text-center py-8">
            <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 mb-1">活动进行中</p>
            <p className="text-xs text-slate-400">
              活动结束后可生成前后测对比报告（团体趋势分析）
            </p>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-slate-600 mb-3">
              活动已结束，可以生成效果报告
            </p>
            <button
              className="px-5 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500"
            >
              生成团体效果报告
            </button>
            <p className="text-xs text-slate-400 mt-2">
              将对比成员的前测和后测数据，计算效应量和风险迁移
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

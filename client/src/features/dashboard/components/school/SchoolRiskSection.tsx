import React from 'react';
import { Loader2 } from 'lucide-react';
import { useClassRiskMatrix } from '../../../../api/useSchoolAnalytics';
import { RiskBarStack, type RiskBarStackRow } from '../../../../shared/components/dashboard';

/**
 * Phase 14c — "风险关注" section for SchoolDashboard.
 *
 * Two side-by-side panels:
 *   - Left:  年级分布条形图（复用原 SchoolDashboard 的年级横条样式）
 *   - Right: 班级 × 风险矩阵（使用 shared RiskBarStack）
 *
 * "先总后分"中的"分"：从年级粗粒度到班级细粒度。
 */

export interface SchoolRiskSectionProps {
  /** 年级分布数据（沿用 /school/students/stats 的 grades） */
  grades: Array<{ name: string; count: number }>;
  totalStudents: number;
}

export function SchoolRiskSection({ grades, totalStudents }: SchoolRiskSectionProps) {
  const { data: classRows, isLoading } = useClassRiskMatrix();

  const rows: RiskBarStackRow[] = (classRows ?? []).map((c) => ({
    label: `${c.grade} ${c.className}`,
    subLabel: `${c.totalStudents} 人在册 · ${c.totalAssessed} 人已测`,
    riskCounts: c.riskCounts,
    totalAssessed: c.totalAssessed,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* 左: 年级分布 */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">年级分布</h3>
          <p className="text-xs text-slate-400 mt-0.5">按年级统计在册学生数</p>
        </div>
        <div className="p-4 space-y-3">
          {grades.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">暂无年级数据</div>
          ) : (
            grades.map((g) => {
              const pct = totalStudents > 0
                ? Math.round((g.count / totalStudents) * 100)
                : 0;
              return (
                <div key={g.name} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-16 truncate">{g.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-teal-400 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-500 w-16 text-right">
                    {g.count} 人
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 右: 班级 × 风险矩阵 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">班级 × 风险矩阵</h3>
          <p className="text-xs text-slate-400 mt-0.5">按高风险（L3+L4）数降序</p>
        </div>
        {isLoading ? (
          <div className="py-8 flex items-center justify-center text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            加载中
          </div>
        ) : (
          <RiskBarStack
            rows={rows}
            emptyText="暂无测评数据 — 请先为学生发放测评"
          />
        )}
      </div>
    </div>
  );
}

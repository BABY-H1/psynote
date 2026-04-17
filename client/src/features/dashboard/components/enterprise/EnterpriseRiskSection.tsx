import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  RiskLevelBreakdown,
  RiskBarStack,
  type RiskBarStackRow,
} from '../../../../shared/components/dashboard';
import {
  useEapRiskDistribution,
  useEapDepartmentBreakdown,
  normalizeRiskDistribution,
} from '../../../../api/useEapAnalytics';

/**
 * Phase 14d — Enterprise dashboard "分布·风险" section.
 *
 * Parallel to SchoolDashboard's risk section (class × risk). For enterprise:
 *   - Left: overall L1-L4 distribution (the "总")
 *   - Right: dimension × risk stacked matrix (the "分")
 *
 * Dimension = department (not class). k-anonymity is already enforced by
 * the /eap/analytics/department endpoint (< 5 people merged into "其他").
 *
 * Clicking a department row navigates to /delivery/people?department=<name>
 * (or similar — adjust to match the generic shell's people list).
 */
export function EnterpriseRiskSection() {
  const navigate = useNavigate();
  const { data: rd, isLoading: rdLoading } = useEapRiskDistribution();
  const { data: dept, isLoading: deptLoading } = useEapDepartmentBreakdown();

  const distribution = normalizeRiskDistribution(rd);

  const rows: RiskBarStackRow[] = (dept?.departments ?? []).map((d) => {
    const rc = d.riskDistribution || {};
    const riskCounts = {
      level_1: Number((rc as any).level_1 || 0),
      level_2: Number((rc as any).level_2 || 0),
      level_3: Number((rc as any).level_3 || 0),
      level_4: Number((rc as any).level_4 || 0),
    };
    const totalAssessed = riskCounts.level_1 + riskCounts.level_2 + riskCounts.level_3 + riskCounts.level_4;
    return {
      label: d.name,
      subLabel: `${d.employeeCount} 人注册 · ${totalAssessed} 人已测`,
      riskCounts,
      totalAssessed,
    };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* 左: 整体 L1-L4 分布 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">整体风险分布</h3>
          <p className="text-xs text-slate-400 mt-0.5">按最新测评风险等级</p>
        </div>
        {rdLoading ? (
          <div className="py-8 flex items-center justify-center text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />加载中
          </div>
        ) : (
          <RiskLevelBreakdown distribution={distribution} />
        )}
      </div>

      {/* 右: 部门 × 风险矩阵 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">部门 × 风险矩阵</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            点击部门查看员工详情 · &lt; 5 人部门合并为"其他"保护隐私
          </p>
        </div>
        {deptLoading ? (
          <div className="py-8 flex items-center justify-center text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />加载中
          </div>
        ) : (
          <RiskBarStack
            rows={rows}
            emptyText="暂无部门数据"
            onRowClick={(row) => {
              if (row.label === '其他') return;
              // Navigate to delivery/people filtered by department (generic people list)
              navigate(`/delivery/people?department=${encodeURIComponent(row.label)}`);
            }}
          />
        )}
      </div>
    </div>
  );
}

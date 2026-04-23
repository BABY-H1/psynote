import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Filter, ChevronRight } from 'lucide-react';
import {
  useEapDepartmentBreakdown,
} from '../../../../api/useEapAnalytics';
import { RiskBarStack, type RiskBarStackRow } from '../../../../shared/components/dashboard';

/**
 * 企业首页中间 + 右列：部门风险视图 + 按需关注部门排名。
 *
 * 结构对齐 SchoolRiskExplorer，但维度从 年级/班级 → 部门。
 * 由于 EAP 走 k-anonymity（部门少于 5 人合并为"其他"），右列只能展示
 * 部门级汇总，点击进 /delivery/people?department=X 看员工名单。
 */
export function EnterpriseRiskExplorer() {
  const navigate = useNavigate();
  const { data: dept, isLoading } = useEapDepartmentBreakdown();

  const allDepartments = useMemo(
    () => (dept?.departments ?? []).map((d) => d.name),
    [dept],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const active = selected.size > 0;

  const filteredDepts = useMemo(() => {
    const rows = dept?.departments ?? [];
    return rows.filter((d) => !active || selected.has(d.name));
  }, [dept, active, selected]);

  const barRows: RiskBarStackRow[] = filteredDepts.map((d) => {
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

  const rankedDepts = useMemo(() => {
    return [...filteredDepts]
      .map((d) => {
        const rc = d.riskDistribution || {};
        const l3 = Number((rc as any).level_3 || 0);
        const l4 = Number((rc as any).level_4 || 0);
        const highRisk = l3 + l4;
        return { ...d, highRisk, l3, l4 };
      })
      .sort((a, b) => b.highRisk - a.highRisk);
  }, [filteredDepts]);

  function toggleDept(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    setSelected(next);
  }
  function clear() {
    setSelected(new Set());
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-0">
      {/* 中列 · 部门风险视图 */}
      <div className="bg-white rounded-xl border border-slate-200 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            风险视图 · 按部门
          </h3>
          {active && (
            <button
              type="button"
              onClick={clear}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              清空筛选
            </button>
          )}
        </div>

        <div className="px-4 py-3 border-b border-slate-100 space-y-2 flex-shrink-0">
          <div>
            <div className="text-[11px] text-slate-400 mb-1">测评（即将上线）</div>
            <select
              disabled
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-400"
            >
              <option>全部测评</option>
            </select>
          </div>
          <div>
            <div className="text-[11px] text-slate-400 mb-1">部门</div>
            <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
              {allDepartments.length === 0 ? (
                <span className="text-xs text-slate-300">暂无</span>
              ) : allDepartments.map((d) => {
                const on = selected.has(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDept(d)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition ${
                      on
                        ? 'bg-teal-50 border-teal-300 text-teal-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="py-8 flex items-center justify-center text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />加载中
            </div>
          ) : (
            <RiskBarStack
              rows={barRows}
              maxHeight="max-h-full"
              emptyText={active ? '当前筛选下无数据' : '暂无部门数据'}
            />
          )}
        </div>
      </div>

      {/* 右列 · 部门排名（点击跳员工列表） */}
      <div className="bg-white rounded-xl border border-slate-200 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">需关注部门</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">按 L3+L4 降序 · 点击查看员工名单</p>
          </div>
          <span className="text-xs text-slate-400">{rankedDepts.length} 个</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="py-8 flex items-center justify-center text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />加载中
            </div>
          ) : rankedDepts.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">暂无部门数据</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rankedDepts.map((d) => {
                const isOther = d.name === '其他';
                const border = d.l4 > 0
                  ? 'border-rose-300'
                  : d.l3 > 0
                    ? 'border-orange-300'
                    : 'border-emerald-200';
                return (
                  <li key={d.name}>
                    <button
                      type="button"
                      disabled={isOther}
                      onClick={() => navigate(`/delivery/people?department=${encodeURIComponent(d.name)}`)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-l-4 ${border} ${
                        isOther ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {d.name}
                          {isOther && (
                            <span className="ml-2 text-[10px] text-slate-400">&lt; 5 人合并，隐私保护</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {d.employeeCount} 人注册
                          {d.l4 > 0 && <span className="text-rose-600 ml-2">L4 {d.l4}</span>}
                          {d.l3 > 0 && <span className="text-orange-600 ml-2">L3 {d.l3}</span>}
                        </div>
                      </div>
                      {!isOther && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Filter } from 'lucide-react';
import {
  useClassRiskMatrix,
  useHighRiskStudents,
} from '../../../../api/useSchoolAnalytics';
import { RiskBarStack, type RiskBarStackRow } from '../../../../shared/components/dashboard';

/**
 * 学校首页中间列 + 右列：风险视图 + 筛选后的学生名单。
 *
 * 共享过滤状态（年级 / 班级 / 测评），由父组件以 2 列并排显示。
 *
 * 左：按班级的 stacked 风险矩阵（按年级、班级筛选）
 * 右：过滤条件下的学生名单（红→绿），点击跳 `/delivery/people/{userId}`
 *
 * 测评下拉暂为 placeholder（未来对接 /school/analytics/assessments）。
 */

type RiskLevel = 'level_1' | 'level_2' | 'level_3' | 'level_4';

const RISK_STYLE: Record<RiskLevel, { border: string; bg: string; text: string; label: string }> = {
  level_4: { border: 'border-rose-300',    bg: 'bg-rose-50',    text: 'text-rose-700',    label: 'L4 紧急' },
  level_3: { border: 'border-orange-300',  bg: 'bg-orange-50',  text: 'text-orange-700',  label: 'L3 建议' },
  level_2: { border: 'border-amber-200',   bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'L2 关注' },
  level_1: { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'L1 健康' },
};

export function SchoolRiskExplorer() {
  const navigate = useNavigate();
  const { data: classRows, isLoading: matrixLoading } = useClassRiskMatrix();
  const { data: students, isLoading: studentLoading } = useHighRiskStudents(200);

  const allGrades = useMemo(
    () => Array.from(new Set((classRows ?? []).map((r) => r.grade))),
    [classRows],
  );
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set());
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());

  const gradeActive = selectedGrades.size > 0;
  const classActive = selectedClasses.size > 0;

  const classesOfSelectedGrade = useMemo(() => {
    const rows = classRows ?? [];
    if (!gradeActive) return rows;
    return rows.filter((r) => selectedGrades.has(r.grade));
  }, [classRows, gradeActive, selectedGrades]);

  const filteredClassRows = useMemo(() => {
    return classesOfSelectedGrade.filter((r) =>
      !classActive || selectedClasses.has(`${r.grade}|${r.className}`),
    );
  }, [classesOfSelectedGrade, classActive, selectedClasses]);

  const barRows: RiskBarStackRow[] = filteredClassRows.map((c) => ({
    label: `${c.grade} ${c.className}`,
    subLabel: `${c.totalStudents} 人在册 · ${c.totalAssessed} 人已测`,
    riskCounts: c.riskCounts,
    totalAssessed: c.totalAssessed,
  }));

  const filteredStudents = useMemo(() => {
    const list = students ?? [];
    return list
      .filter((s) => !gradeActive || (s.grade && selectedGrades.has(s.grade)))
      .filter((s) => !classActive || (s.grade && s.className && selectedClasses.has(`${s.grade}|${s.className}`)))
      .sort((a, b) => (a.riskLevel === 'level_4' ? -1 : 1) - (b.riskLevel === 'level_4' ? -1 : 1));
  }, [students, gradeActive, selectedGrades, classActive, selectedClasses]);

  function toggleGrade(g: string) {
    const next = new Set(selectedGrades);
    if (next.has(g)) next.delete(g); else next.add(g);
    setSelectedGrades(next);
    if (!next.has(g)) {
      const cls = new Set(selectedClasses);
      for (const key of Array.from(cls)) if (key.startsWith(`${g}|`)) cls.delete(key);
      setSelectedClasses(cls);
    }
  }
  function toggleClass(key: string) {
    const next = new Set(selectedClasses);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedClasses(next);
  }
  function clearFilters() {
    setSelectedGrades(new Set());
    setSelectedClasses(new Set());
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-0">
      {/* 中列 · 风险视图 + 筛选 */}
      <div className="bg-white rounded-xl border border-slate-200 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            风险视图
          </h3>
          {(gradeActive || classActive) && (
            <button
              type="button"
              onClick={clearFilters}
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
            <div className="text-[11px] text-slate-400 mb-1">年级</div>
            <div className="flex flex-wrap gap-1.5">
              {allGrades.length === 0 ? (
                <span className="text-xs text-slate-300">暂无</span>
              ) : allGrades.map((g) => {
                const on = selectedGrades.has(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGrade(g)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition ${
                      on
                        ? 'bg-teal-50 border-teal-300 text-teal-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400 mb-1">班级</div>
            <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
              {classesOfSelectedGrade.length === 0 ? (
                <span className="text-xs text-slate-300">暂无</span>
              ) : classesOfSelectedGrade.map((c) => {
                const key = `${c.grade}|${c.className}`;
                const on = selectedClasses.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleClass(key)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition ${
                      on
                        ? 'bg-teal-50 border-teal-300 text-teal-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {c.className}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {matrixLoading ? (
            <div className="py-8 flex items-center justify-center text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />加载中
            </div>
          ) : (
            <RiskBarStack
              rows={barRows}
              maxHeight="max-h-full"
              emptyText={gradeActive || classActive ? '当前筛选下无数据' : '暂无测评数据'}
            />
          )}
        </div>
      </div>

      {/* 右列 · 学生列表 */}
      <div className="bg-white rounded-xl border border-slate-200 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">需关注学生</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">按 L4 → L3 排列 · 点击进入档案</p>
          </div>
          <span className="text-xs text-slate-400">{filteredStudents.length} 人</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {studentLoading ? (
            <div className="py-8 flex items-center justify-center text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />加载中
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              {gradeActive || classActive ? '当前筛选下无需关注学生' : '暂无 L3/L4 学生'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filteredStudents.map((s) => {
                const style = RISK_STYLE[s.riskLevel];
                return (
                  <li key={s.userId}>
                    <button
                      type="button"
                      onClick={() => navigate(`/delivery/people/${s.userId}`)}
                      className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3 border-l-4 ${style.border}`}
                    >
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.bg} ${style.text} font-semibold flex-shrink-0`}>
                        {style.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {s.name}
                          {s.hasOpenCrisis && (
                            <span className="ml-2 text-[10px] text-rose-600">危机处置中</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {s.grade ?? '未分年级'} {s.className ?? ''} · {s.studentId ?? '无学号'}
                        </div>
                      </div>
                      {s.latestAssessmentAt && (
                        <div className="text-[11px] text-slate-400 flex-shrink-0">
                          {new Date(s.latestAssessmentAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                        </div>
                      )}
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

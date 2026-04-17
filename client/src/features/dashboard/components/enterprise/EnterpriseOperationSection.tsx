import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, AlertTriangle, UserPlus, FileClock, ChevronRight,
} from 'lucide-react';
import { useEapUsageTrend, useEapTodos } from '../../../../api/useEapAnalytics';

/**
 * Phase 14d — Enterprise dashboard "现在·操作台" section.
 *
 * Left (flex-1): 服务使用趋势 (近 30 天, 按周聚合的堆叠柱图)
 * Right (w-72):  待办 (3 action cards: 危机/新员工绑定/合同到期)
 *
 * Clicking cards navigates into the generic AppShell's relevant pages:
 *   - 危机预警待处理 → /collaboration?tab=crisis
 *   - 新员工待绑定   → /delivery/people
 *   - 合同到期       → /settings (subscription tab)
 */

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  assessment_completed: { label: '测评', color: 'bg-teal-400' },
  session_booked:       { label: '预约', color: 'bg-violet-400' },
  session_completed:    { label: '咨询', color: 'bg-blue-400' },
  course_enrolled:      { label: '课程', color: 'bg-amber-400' },
  group_participated:   { label: '团辅', color: 'bg-orange-400' },
};

export function EnterpriseOperationSection() {
  const navigate = useNavigate();
  const { data: trend, isLoading: trendLoading } = useEapUsageTrend(30);
  const { data: todos, isLoading: todosLoading } = useEapTodos();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-4 items-start">
      {/* Left: usage trend */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">服务使用趋势</h3>
          <p className="text-xs text-slate-400 mt-0.5">近 30 天 · 按周聚合</p>
        </div>
        {trendLoading ? (
          <div className="py-12 flex items-center justify-center text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />加载中
          </div>
        ) : (
          <UsageTrendSimple data={trend?.data ?? []} />
        )}
      </div>

      {/* Right: todos */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">待办事项</h3>
        </div>
        {todosLoading ? (
          <div className="py-8 flex items-center justify-center text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <TodoRow
              icon={<AlertTriangle className="w-4 h-4" />}
              iconTone="text-rose-600 bg-rose-50"
              label="危机预警待处理"
              count={todos?.openCrisisCount ?? 0}
              unit="起"
              highlight={(todos?.openCrisisCount ?? 0) > 0}
              onClick={() => navigate('/collaboration?tab=crisis')}
            />
            <TodoRow
              icon={<UserPlus className="w-4 h-4" />}
              iconTone="text-amber-600 bg-amber-50"
              label="新员工待绑定"
              count={todos?.pendingEmployeeBindCount ?? 0}
              unit="人"
              highlight={(todos?.pendingEmployeeBindCount ?? 0) > 0}
              onClick={() => navigate('/delivery/people')}
            />
            <SubscriptionRow
              days={todos?.subscriptionEndsInDays ?? null}
              endsAt={todos?.subscriptionEndsAt ?? null}
              onClick={() => navigate('/settings')}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TodoRow({
  icon, iconTone, label, count, unit, highlight, onClick,
}: {
  icon: React.ReactNode;
  iconTone: string;
  label: string;
  count: number;
  unit?: string;
  highlight?: boolean;
  onClick?: () => void;
}) {
  const Comp: any = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full p-3 flex items-center gap-3 text-left ${
        onClick ? 'hover:bg-slate-50 transition cursor-pointer' : ''
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconTone}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-800">{label}</div>
        <div className={`text-lg font-bold ${highlight ? 'text-rose-700' : 'text-slate-400'}`}>
          {count}
          {unit && <span className="text-xs font-normal text-slate-400 ml-0.5">{unit}</span>}
        </div>
      </div>
      {onClick && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
    </Comp>
  );
}

function SubscriptionRow({
  days, endsAt, onClick,
}: {
  days: number | null;
  endsAt: string | null;
  onClick?: () => void;
}) {
  if (days === null || endsAt === null) {
    return (
      <div className="w-full p-3 flex items-center gap-3 opacity-60">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-slate-400 bg-slate-50">
          <FileClock className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-600">合同 / 订阅到期</div>
          <div className="text-xs text-slate-400">未检测到订阅数据</div>
        </div>
      </div>
    );
  }

  const urgent = days <= 30;
  const expired = days <= 0;
  const Comp: any = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full p-3 flex items-center gap-3 text-left ${
        onClick ? 'hover:bg-slate-50 transition cursor-pointer' : ''
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        expired ? 'text-rose-600 bg-rose-50' : urgent ? 'text-amber-600 bg-amber-50' : 'text-slate-400 bg-slate-50'
      }`}>
        <FileClock className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-800">合同 / 订阅到期</div>
        <div className={`text-lg font-bold ${expired ? 'text-rose-700' : urgent ? 'text-amber-700' : 'text-slate-500'}`}>
          {expired ? '已过期' : `${days} 天`}
          <span className="text-xs font-normal text-slate-400 ml-1">
            {new Date(endsAt).toLocaleDateString('zh-CN')}
          </span>
        </div>
      </div>
      {onClick && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
    </Comp>
  );
}

/**
 * Lightweight stacked bar chart of last-30-day event counts, aggregated by
 * week. 5 series (assessment/booked/completed/course/group) stacked.
 */
function UsageTrendSimple({
  data,
}: {
  data: Array<{ date: string; type: string; count: number }>;
}) {
  const now = new Date();
  const bucketStart = new Date(now);
  bucketStart.setDate(now.getDate() - 27);
  bucketStart.setHours(0, 0, 0, 0);

  const weeks: Array<{ weekIdx: number; range: string; totals: Record<string, number> }> = [];
  for (let w = 0; w < 4; w++) {
    const start = new Date(bucketStart);
    start.setDate(bucketStart.getDate() + w * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    weeks.push({
      weekIdx: w,
      range: `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`,
      totals: {},
    });
  }

  for (const r of data) {
    const d = new Date(r.date);
    const idx = Math.floor((d.getTime() - bucketStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (idx < 0 || idx >= 4) continue;
    weeks[idx].totals[r.type] = (weeks[idx].totals[r.type] ?? 0) + r.count;
  }

  const maxStackTotal = Math.max(1, ...weeks.map((w) =>
    Object.values(w.totals).reduce((a, b) => a + b, 0)
  ));

  if (weeks.every((w) => Object.keys(w.totals).length === 0)) {
    return <div className="p-8 text-center text-sm text-slate-400">近 30 天暂无服务使用数据</div>;
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-end justify-around gap-4 h-40">
        {weeks.map((w) => {
          const weekTotal = Object.values(w.totals).reduce((a, b) => a + b, 0);
          return (
            <div key={w.weekIdx} className="flex flex-col items-center gap-1.5 flex-1">
              <div className="text-xs text-slate-500 font-medium tabular-nums">{weekTotal}</div>
              <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${(weekTotal / maxStackTotal) * 100}%`, minHeight: weekTotal > 0 ? 4 : 0 }}>
                {Object.entries(EVENT_TYPE_LABELS).map(([type, meta]) => {
                  const cnt = w.totals[type] ?? 0;
                  if (cnt === 0) return null;
                  const pct = (cnt / weekTotal) * 100;
                  return (
                    <div
                      key={type}
                      className={meta.color}
                      style={{ height: `${pct}%` }}
                      title={`${meta.label} ${cnt}`}
                    />
                  );
                })}
              </div>
              <div className="text-[10px] text-slate-400 whitespace-nowrap">{w.range}</div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-500 pt-2 border-t border-slate-100">
        {Object.entries(EVENT_TYPE_LABELS).map(([type, meta]) => (
          <div key={type} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-sm inline-block ${meta.color}`} />
            {meta.label}
          </div>
        ))}
      </div>
    </div>
  );
}

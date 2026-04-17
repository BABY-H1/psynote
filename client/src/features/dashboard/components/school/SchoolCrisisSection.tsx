import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Activity, Inbox, ClipboardCheck, CheckCircle2, Loader2,
} from 'lucide-react';
import { StatTile } from '../../../../shared/components/dashboard';
import { useCrisisByClass } from '../../../../api/useSchoolAnalytics';
import { useCrisisStats } from '../../../../api/useCrisisStats';

/**
 * Phase 14c — "危机处置" section for SchoolDashboard.
 *
 * 5 small StatTile cards + small horizontal bar chart "按班级分布".
 *
 * The 5 cards mirror CrisisDashboardTab's top-row but add a new card
 * 待处置 (pending_candidate_count — crisis candidates not yet accepted).
 */
export function SchoolCrisisSection() {
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useCrisisStats();
  const { data: byClass, isLoading: classLoading } = useCrisisByClass();

  const cards = stats?.cards;

  // Only show classes that actually have crisis cases
  const classRows = (byClass ?? []).filter((c) => c.total > 0).slice(0, 5);
  const maxTotal = Math.max(1, ...classRows.map((c) => c.total));

  return (
    <div className="space-y-4">
      {/* 5 small stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <StatTile
          icon={<Sparkles className="w-4 h-4" />}
          tone="slate"
          label="总数"
          value={cards?.total}
          suffix="起"
          loading={statsLoading}
        />
        <StatTile
          icon={<Activity className="w-4 h-4" />}
          tone="rose"
          label="处置中"
          value={cards?.openCount}
          loading={statsLoading}
          highlight={!!cards?.openCount && cards.openCount > 0}
          onClick={() => navigate('/collaboration?tab=crisis')}
        />
        <StatTile
          icon={<Inbox className="w-4 h-4" />}
          tone="amber"
          label="待处置"
          value={cards?.pendingCandidateCount}
          loading={statsLoading}
          highlight={!!cards?.pendingCandidateCount && cards.pendingCandidateCount > 0}
          hint={cards?.pendingCandidateCount ? undefined : '候选池'}
          onClick={() => navigate('/collaboration?tab=candidates')}
        />
        <StatTile
          icon={<ClipboardCheck className="w-4 h-4" />}
          tone="amber"
          label="待督导"
          value={cards?.pendingSignOffCount}
          loading={statsLoading}
          highlight={!!cards?.pendingSignOffCount && cards.pendingSignOffCount > 0}
          onClick={() => navigate('/collaboration?tab=crisis')}
        />
        <StatTile
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="emerald"
          label="本月结"
          value={cards?.closedThisMonth}
          loading={statsLoading}
        />
      </div>

      {/* Small bar chart — 按班级分布 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">按班级分布</h3>
          <p className="text-xs text-slate-400 mt-0.5">仅显示有危机案件的班级</p>
        </div>
        {classLoading ? (
          <div className="py-6 flex items-center justify-center text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />加载中
          </div>
        ) : classRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">暂无危机案件</div>
        ) : (
          <div className="p-4 space-y-2.5">
            {classRows.map((c) => {
              const pct = Math.round((c.total / maxTotal) * 100);
              return (
                <div key={`${c.grade}-${c.className}`} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-28 truncate">
                    {c.grade} {c.className}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-rose-400 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 w-20 text-right">
                    {c.total} 起
                    {c.openCount > 0 && (
                      <span className="text-rose-600 ml-1">({c.openCount} 处置中)</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

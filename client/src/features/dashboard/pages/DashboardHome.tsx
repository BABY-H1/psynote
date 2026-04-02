import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, Users, BookOpen, Layers,
  Calendar, FileText, AlertTriangle, TrendingUp,
  ArrowRight, Activity,
} from 'lucide-react';
import { useEpisodes } from '../../../api/useCounseling';
import { useAssessments, useResults } from '../../../api/useAssessments';
import { useGroupInstances } from '../../../api/useGroups';
import { useCourses } from '../../../api/useCourses';
import { useAuthStore } from '../../../stores/authStore';

export function DashboardHome() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // Fetch data for stats
  const { data: episodes } = useEpisodes();
  const { data: assessments } = useAssessments();
  const { data: results } = useResults();
  const { data: groups } = useGroupInstances();
  const { data: courses } = useCourses();

  // Compute stats
  const activeEpisodes = episodes?.filter((e) => e.status === 'active') ?? [];
  const highRiskEpisodes = activeEpisodes.filter(
    (e) => e.currentRisk === 'level_3' || e.currentRisk === 'level_4',
  );
  const recruitingGroups = groups?.filter((g) => g.status === 'recruiting') ?? [];
  const publishedCourses = courses?.filter((c) => c.status === 'published') ?? [];
  const recentResults = results?.slice(0, 5) ?? [];

  // Risk distribution
  const riskCounts = {
    level_1: activeEpisodes.filter((e) => e.currentRisk === 'level_1').length,
    level_2: activeEpisodes.filter((e) => e.currentRisk === 'level_2').length,
    level_3: activeEpisodes.filter((e) => e.currentRisk === 'level_3').length,
    level_4: activeEpisodes.filter((e) => e.currentRisk === 'level_4').length,
  };
  const totalRisk = riskCounts.level_1 + riskCounts.level_2 + riskCounts.level_3 + riskCounts.level_4;

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          你好，{user?.name || '用户'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          欢迎回到 Psynote 工作台，以下是今天的概览
        </p>
      </div>

      {/* Quick shortcuts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ShortcutCard
          icon={<ClipboardList className="w-5 h-5" />}
          label="测评管理"
          desc="量表与测评"
          onClick={() => navigate('/assessments')}
          color="brand"
        />
        <ShortcutCard
          icon={<Users className="w-5 h-5" />}
          label="个体咨询"
          desc="个案工作台"
          onClick={() => navigate('/episodes')}
          color="blue"
        />
        <ShortcutCard
          icon={<Layers className="w-5 h-5" />}
          label="团辅中心"
          desc="方案与活动"
          onClick={() => navigate('/groups')}
          color="amber"
        />
        <ShortcutCard
          icon={<BookOpen className="w-5 h-5" />}
          label="课程中心"
          desc="课程创作"
          onClick={() => navigate('/courses')}
          color="purple"
        />
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="活跃个案"
          value={activeEpisodes.length}
          sub={highRiskEpisodes.length > 0 ? `${highRiskEpisodes.length} 例高风险` : '运行正常'}
          icon={<Activity className="w-5 h-5 text-brand-500" />}
          alert={highRiskEpisodes.length > 0}
        />
        <StatCard
          label="测评量表"
          value={assessments?.length ?? 0}
          sub={`${results?.length ?? 0} 份结果`}
          icon={<FileText className="w-5 h-5 text-blue-500" />}
        />
        <StatCard
          label="团辅活动"
          value={groups?.length ?? 0}
          sub={`${recruitingGroups.length} 个招募中`}
          icon={<Calendar className="w-5 h-5 text-amber-500" />}
        />
        <StatCard
          label="课程"
          value={courses?.length ?? 0}
          sub={`${publishedCourses.length} 个已发布`}
          icon={<BookOpen className="w-5 h-5 text-purple-500" />}
        />
      </div>

      {/* Bottom row: risk distribution + recent results */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Risk distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">风险等级分布</h3>
            <button
              onClick={() => navigate('/episodes')}
              className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              查看全部 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {totalRisk === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400">暂无活跃个案数据</div>
          ) : (
            <div className="space-y-3">
              <RiskBar label="一般" level="level_1" count={riskCounts.level_1} total={totalRisk} color="bg-emerald-500" />
              <RiskBar label="关注" level="level_2" count={riskCounts.level_2} total={totalRisk} color="bg-yellow-500" />
              <RiskBar label="严重" level="level_3" count={riskCounts.level_3} total={totalRisk} color="bg-orange-500" />
              <RiskBar label="危机" level="level_4" count={riskCounts.level_4} total={totalRisk} color="bg-red-500" />
            </div>
          )}
        </div>

        {/* Recent results */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">最近测评结果</h3>
            <button
              onClick={() => navigate('/assessments')}
              className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              查看全部 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {recentResults.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400">暂无测评结果</div>
          ) : (
            <div className="space-y-2">
              {recentResults.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <RiskDot level={r.riskLevel} />
                    <div className="min-w-0">
                      <div className="text-sm text-slate-700 truncate">
                        {r.assessmentId?.slice(0, 8)}...
                      </div>
                      <div className="text-xs text-slate-400">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-CN') : '-'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.totalScore != null && (
                      <span className="text-sm font-medium text-slate-900">{r.totalScore}分</span>
                    )}
                    <RiskTag level={r.riskLevel} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

const colorMap = {
  brand: { bg: 'bg-brand-50', text: 'text-brand-600', border: 'border-brand-100' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100' },
};

function ShortcutCard({ icon, label, desc, onClick, color }: {
  icon: React.ReactNode; label: string; desc: string;
  onClick: () => void; color: keyof typeof colorMap;
}) {
  const c = colorMap[color];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 p-4 rounded-xl border ${c.border} ${c.bg} hover:shadow-sm transition text-left w-full group`}
    >
      <div className={`${c.text}`}>{icon}</div>
      <div>
        <div className={`text-sm font-semibold ${c.text}`}>{label}</div>
        <div className="text-xs text-slate-400">{desc}</div>
      </div>
      <ArrowRight className={`w-4 h-4 ${c.text} opacity-0 group-hover:opacity-100 transition ml-auto`} />
    </button>
  );
}

function StatCard({ label, value, sub, icon, alert }: {
  label: string; value: number; sub: string; icon: React.ReactNode; alert?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className={`text-xs mt-1 ${alert ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
        {alert && <AlertTriangle className="w-3 h-3 inline mr-1" />}
        {sub}
      </div>
    </div>
  );
}

function RiskBar({ label, count, total, color }: {
  label: string; level: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-8">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-700 w-8 text-right">{count}</span>
    </div>
  );
}

const riskColors: Record<string, string> = {
  level_1: 'bg-emerald-500',
  level_2: 'bg-yellow-500',
  level_3: 'bg-orange-500',
  level_4: 'bg-red-500',
};

const riskLabels: Record<string, string> = {
  level_1: '一般',
  level_2: '关注',
  level_3: '严重',
  level_4: '危机',
};

const riskTagColors: Record<string, string> = {
  level_1: 'bg-emerald-50 text-emerald-700',
  level_2: 'bg-yellow-50 text-yellow-700',
  level_3: 'bg-orange-50 text-orange-700',
  level_4: 'bg-red-50 text-red-700',
};

function RiskDot({ level }: { level?: string | null }) {
  return <div className={`w-2 h-2 rounded-full ${riskColors[level || ''] || 'bg-slate-300'}`} />;
}

function RiskTag({ level }: { level?: string | null }) {
  if (!level || !riskLabels[level]) return null;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${riskTagColors[level]}`}>
      {riskLabels[level]}
    </span>
  );
}

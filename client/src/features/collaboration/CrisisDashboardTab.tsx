/**
 * Phase 14b — Crisis Dashboard tab.
 *
 * Renders organisation-wide crisis case stats from
 * GET /api/orgs/:orgId/crisis/stats. Visible to org_admin + counselor
 * (supervisors are counselors with fullPracticeAccess).
 *
 * Layout:
 *   [Card row]    总数 / 处置中 / 待督导审核 / 本月结案 / 重新打开
 *   [2-col grid]  按咨询师分布 (table)        近 6 月趋势 (bar pair)
 *                 待审核案件 (table)          来源分布 (donut-ish)
 *   [Full-width]  最近活动 (timeline list)
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ClipboardCheck, CheckCircle2, RefreshCcw,
  Activity, FileText, ChevronRight, Loader2, Sparkles, Inbox,
} from 'lucide-react';
import { useCrisisStats } from '../../api/useCrisisStats';
import { StatTile, MonthlyTrendChart } from '../../shared/components/dashboard';

const EVENT_LABELS: Record<string, { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }> = {
  crisis_opened: { label: '案件开启', tone: 'text-rose-700 bg-rose-50', icon: AlertTriangle },
  crisis_step_reinterview: { label: '再评估访谈', tone: 'text-blue-700 bg-blue-50', icon: ClipboardCheck },
  crisis_step_parentContact: { label: '家长联系', tone: 'text-blue-700 bg-blue-50', icon: ClipboardCheck },
  crisis_step_documents: { label: '发放文书', tone: 'text-blue-700 bg-blue-50', icon: FileText },
  crisis_step_referral: { label: '转介', tone: 'text-blue-700 bg-blue-50', icon: ClipboardCheck },
  crisis_step_followUp: { label: '追踪随访', tone: 'text-blue-700 bg-blue-50', icon: ClipboardCheck },
  crisis_submitted_for_sign_off: { label: '提交审核', tone: 'text-amber-700 bg-amber-50', icon: ClipboardCheck },
  crisis_signed_off: { label: '督导结案', tone: 'text-emerald-700 bg-emerald-50', icon: CheckCircle2 },
  crisis_reopened: { label: '督导退回', tone: 'text-amber-700 bg-amber-50', icon: RefreshCcw },
};

export function CrisisDashboardTab() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useCrisisStats();

  if (isLoading) {
    return (
      <div className="py-12 flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        加载危机仪表板…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-10 text-center text-sm text-rose-600">
        加载失败 ·
        <button onClick={() => refetch()} className="ml-2 underline">重试</button>
      </div>
    );
  }

  const { cards, byCounselor, bySource, monthlyTrend, recentActivity, pendingSignOffList } = data;
  const sourceTotal = bySource.auto_candidate + bySource.manual;
  const autoPct = sourceTotal > 0 ? Math.round((bySource.auto_candidate / sourceTotal) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Top cards — now 6 (added 待处置) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile
          icon={<Sparkles className="w-4 h-4" />}
          tone="slate"
          label="案件总数"
          value={cards.total}
        />
        <StatTile
          icon={<Activity className="w-4 h-4" />}
          tone="rose"
          label="处置中"
          value={cards.openCount}
          highlight={cards.openCount > 0}
        />
        <StatTile
          icon={<Inbox className="w-4 h-4" />}
          tone="amber"
          label="待处置"
          value={cards.pendingCandidateCount}
          highlight={cards.pendingCandidateCount > 0}
          hint="候选池"
        />
        <StatTile
          icon={<ClipboardCheck className="w-4 h-4" />}
          tone="amber"
          label="待督导审核"
          value={cards.pendingSignOffCount}
          highlight={cards.pendingSignOffCount > 0}
        />
        <StatTile
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="emerald"
          label="本月结案"
          value={cards.closedThisMonth}
        />
        <StatTile
          icon={<RefreshCcw className="w-4 h-4" />}
          tone="amber"
          label="督导退回中"
          value={cards.reopenedCount}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pending sign-off — actionable */}
        <Card title="待督导审核案件" badge={pendingSignOffList.length > 0 ? String(pendingSignOffList.length) : undefined}>
          {pendingSignOffList.length === 0 ? (
            <Empty text="暂无待审核案件" />
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {pendingSignOffList.map((row) => (
                <button
                  key={row.caseId}
                  type="button"
                  onClick={() => navigate(`/episodes/${row.episodeId}?mode=crisis`)}
                  className="w-full text-left p-3 hover:bg-amber-50/50 transition flex items-start gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                    <ClipboardCheck className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {row.clientName || '(未知来访者)'}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      由 {row.counselorName || '—'} 提交
                      {row.submittedAt && (
                        <span className="ml-2">{new Date(row.submittedAt).toLocaleString('zh-CN')}</span>
                      )}
                    </div>
                    {row.closureSummary && (
                      <div className="text-xs text-slate-600 mt-1 line-clamp-2">{row.closureSummary}</div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Per-counselor breakdown */}
        <Card title="按咨询师分布" subtitle="谁负担最重">
          {byCounselor.length === 0 ? (
            <Empty text="暂无数据" />
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              <div className="grid grid-cols-12 px-3 py-2 text-[10px] font-semibold text-slate-400 bg-slate-50">
                <div className="col-span-5">咨询师</div>
                <div className="col-span-2 text-right">处置中</div>
                <div className="col-span-2 text-right">待审</div>
                <div className="col-span-2 text-right">已结</div>
                <div className="col-span-1 text-right">合计</div>
              </div>
              {byCounselor.map((c) => (
                <div key={c.counselorId} className="grid grid-cols-12 px-3 py-2 text-sm items-center">
                  <div className="col-span-5 flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs flex-shrink-0">
                      {c.counselorName.charAt(0)}
                    </div>
                    <span className="truncate text-slate-800">{c.counselorName}</span>
                  </div>
                  <div className={`col-span-2 text-right ${c.openCount > 0 ? 'font-bold text-rose-600' : 'text-slate-400'}`}>
                    {c.openCount}
                  </div>
                  <div className={`col-span-2 text-right ${c.pendingCount > 0 ? 'font-bold text-amber-600' : 'text-slate-400'}`}>
                    {c.pendingCount}
                  </div>
                  <div className="col-span-2 text-right text-slate-600">{c.closedCount}</div>
                  <div className="col-span-1 text-right text-slate-700 font-medium">{c.total}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Monthly trend (bar pair) */}
        <Card title="近 6 月趋势" subtitle="开案 vs 结案">
          {monthlyTrend.every((m) => m.opened === 0 && m.closed === 0) ? (
            <Empty text="近 6 个月暂无危机案件" />
          ) : (
            <div className="p-4">
              <MonthlyTrendChart data={monthlyTrend} />
            </div>
          )}
        </Card>

        {/* Source distribution */}
        <Card title="来源分布" subtitle="规则触发 vs 手工开案">
          {sourceTotal === 0 ? (
            <Empty text="暂无数据" />
          ) : (
            <div className="p-4 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">由规则引擎触发</span>
                  <span className="text-slate-500">{bySource.auto_candidate} 例 · {autoPct}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded overflow-hidden">
                  <div className="h-full bg-rose-400" style={{ width: `${autoPct}%` }} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">咨询师手工开案</span>
                  <span className="text-slate-500">{bySource.manual} 例 · {100 - autoPct}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded overflow-hidden">
                  <div className="h-full bg-blue-400" style={{ width: `${100 - autoPct}%` }} />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-3">
                规则引擎触发的案件来自高风险测评结果落入候选池后被咨询师接手。
                手工开案则是咨询师在面谈过程中主动判断为危机后开启的。
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Recent activity */}
      <Card title="最近活动" subtitle="跨所有案件的最新 10 条事件">
        {recentActivity.length === 0 ? (
          <Empty text="暂无活动" />
        ) : (
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {recentActivity.map((evt) => {
              const meta = EVENT_LABELS[evt.eventType] || {
                label: evt.eventType,
                tone: 'text-slate-700 bg-slate-100',
                icon: Activity,
              };
              const Icon = meta.icon;
              return (
                <button
                  key={evt.id}
                  type="button"
                  onClick={() => navigate(`/episodes/${evt.careEpisodeId}?mode=crisis`)}
                  className="w-full text-left p-3 hover:bg-slate-50 transition flex items-start gap-3"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.tone}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${meta.tone}`}>{meta.label}</span>
                      <span className="text-slate-700 truncate">{evt.title || '—'}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {evt.clientName ? <>来访者 <strong className="text-slate-700">{evt.clientName}</strong> · </> : null}
                      {evt.createdByName ? <>由 {evt.createdByName} · </> : null}
                      {new Date(evt.createdAt).toLocaleString('zh-CN')}
                    </div>
                    {evt.summary && (
                      <div className="text-xs text-slate-600 mt-1 line-clamp-1">{evt.summary}</div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" />
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({
  title, subtitle, badge, children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {subtitle && <span className="text-xs text-slate-400">· {subtitle}</span>}
        {badge && (
          <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm text-slate-400">{text}</div>;
}

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, TrendingUp, CalendarClock, BellOff } from 'lucide-react';
import { useEpisodes, useAppointments } from '../../../api/useCounseling';
import { useResults } from '../../../api/useAssessments';

/**
 * 档案库 · 过去 — 需要跟进
 *
 * 纯客户端规则的告警面板（v1，不新增 API）。三条规则：
 *
 *   规则 A — 高风险长期未跟进:
 *     currentRisk ∈ {level_3, level_4} 且 episode.updatedAt > 14 天前
 *     （updatedAt 作为"无近期 timeline 记录"的近似指标）
 *
 *   规则 B — 测评分数上升:
 *     同一 (assessmentId, userId) 下，最近一次 totalScore 比上一次 ≥ +20%
 *
 *   规则 C — 预约待确认:
 *     status='pending' 且创建超过 48h 的预约
 *
 * 真正的服务端 follow-up review 系统已在 server 端存在，但首页这里
 * 故意做轻量提醒，避免新增加载来源。Phase 6 之后可以接入聚合 API。
 */

interface AlertItem {
  id: string;
  rule: 'high_risk_stale' | 'score_up' | 'appt_pending';
  title: string;
  detail: string;
  onClick: () => void;
}

const RULE_META: Record<
  AlertItem['rule'],
  { icon: React.ReactNode; tone: string; label: string }
> = {
  high_risk_stale: {
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    tone: 'bg-red-50 text-red-700',
    label: '高风险',
  },
  score_up: {
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    tone: 'bg-orange-50 text-orange-700',
    label: '分数上升',
  },
  appt_pending: {
    icon: <CalendarClock className="w-3.5 h-3.5" />,
    tone: 'bg-amber-50 text-amber-700',
    label: '待确认',
  },
};

export function FollowUpAlerts() {
  const navigate = useNavigate();

  const { data: episodes } = useEpisodes();
  const { data: results } = useResults();
  const { data: appointmentRows } = useAppointments();

  const alerts: AlertItem[] = [];
  const now = Date.now();
  const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
  const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

  // Rule A — high risk + updatedAt > 14 days ago
  for (const e of episodes ?? []) {
    if (e.status !== 'active') continue;
    if (e.currentRisk !== 'level_3' && e.currentRisk !== 'level_4') continue;
    const lastUpdated = new Date(e.updatedAt).getTime();
    if (now - lastUpdated < FOURTEEN_DAYS) continue;
    const days = Math.floor((now - lastUpdated) / (24 * 60 * 60 * 1000));
    const clientName = (e as any).client?.name || '来访者';
    alerts.push({
      id: `hr-${e.id}`,
      rule: 'high_risk_stale',
      title: clientName,
      detail: `${days} 天未更新`,
      onClick: () => navigate(`/episodes/${e.id}`),
    });
  }

  // Rule B — most recent assessment result ≥ +20% from previous (per user × assessment)
  if (results && results.length > 0) {
    const grouped = new Map<string, typeof results>();
    for (const r of results) {
      if (!r.userId) continue;
      const key = `${r.assessmentId}::${r.userId}`;
      const arr = grouped.get(key) ?? [];
      arr.push(r);
      grouped.set(key, arr);
    }
    for (const [, arr] of grouped) {
      if (arr.length < 2) continue;
      const sorted = [...arr].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const latest = sorted[0];
      const prev = sorted[1];
      if (latest.totalScore <= 0 || prev.totalScore <= 0) continue;
      const delta = (latest.totalScore - prev.totalScore) / prev.totalScore;
      if (delta < 0.2) continue;
      alerts.push({
        id: `su-${latest.id}`,
        rule: 'score_up',
        title: `测评分数上升 ${Math.round(delta * 100)}%`,
        detail: `${prev.totalScore} → ${latest.totalScore}`,
        onClick: () => navigate('/assessments'),
      });
    }
  }

  // Rule C — pending appointments older than 48h
  for (const row of appointmentRows ?? []) {
    const a = row.appointment;
    if (a.status !== 'pending') continue;
    const created = new Date(a.createdAt).getTime();
    if (now - created < FORTY_EIGHT_HOURS) continue;
    const hours = Math.floor((now - created) / (60 * 60 * 1000));
    alerts.push({
      id: `ap-${a.id}`,
      rule: 'appt_pending',
      title: row.clientName ? `${row.clientName} 预约` : '预约待确认',
      detail: `已等待 ${hours} 小时`,
      onClick: () => navigate('/'),
    });
  }

  // Cap to keep panel concise
  const visible = alerts.slice(0, 8);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
          需要跟进
          {alerts.length > 0 && (
            <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
              {alerts.length}
            </span>
          )}
        </h3>
        <AlertTriangle className="w-4 h-4 text-slate-300" />
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400 flex flex-col items-center gap-2">
          <BellOff className="w-5 h-5 text-slate-300" />
          暂无需要跟进的告警
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((a) => {
            const meta = RULE_META[a.rule];
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={a.onClick}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition text-left"
                >
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${meta.tone}`}
                  >
                    {meta.icon}
                    {meta.label}
                  </span>
                  <span className="text-sm text-slate-700 truncate flex-1">{a.title}</span>
                  <span className="text-xs text-slate-400 shrink-0">{a.detail}</span>
                </button>
              </li>
            );
          })}
          {alerts.length > visible.length && (
            <li className="text-xs text-slate-400 pt-1 text-center">
              共 {alerts.length} 条，已显示前 {visible.length} 条
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

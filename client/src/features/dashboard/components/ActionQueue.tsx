import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, TrendingUp, CalendarClock, FileEdit, Inbox,
} from 'lucide-react';
import { useEpisodes, useAppointments, useSessionNotes } from '../../../api/useCounseling';
import { useResults } from '../../../api/useAssessments';

/**
 * 需要处理 —— counselor 首页 col-3。
 *
 * 合并原 FollowUpAlerts 的告警视角 + "停在我这里的事"任务视角，归并为
 * 4 条规则（按紧迫度排序）：
 *
 *   1) 待确认预约（status=pending 且创建 >24h）
 *   2) 过期未写笔记（completed appointment 结束 >24h 仍无关联 session note）
 *   3) 高风险个案未跟进（L3/L4 且 episode.updatedAt >14 天）
 *   4) 测评分数上升 +20%
 *
 * 每条点击跳到对应处置页。空态显示"🎉 今日没有积压事项"。
 */

type Tone = 'red' | 'orange' | 'amber' | 'blue';

interface Item {
  id: string;
  rule: 'pending_appt' | 'unwritten_note' | 'high_risk_stale' | 'score_up';
  icon: React.ReactNode;
  tone: Tone;
  ruleLabel: string;
  title: string;
  detail: string;
  onClick: () => void;
  urgency: number; // lower = more urgent, for sorting
}

const TONE_MAP: Record<Tone, string> = {
  red: 'bg-red-50 text-red-700',
  orange: 'bg-orange-50 text-orange-700',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
};

const ONE_DAY = 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS = 14 * ONE_DAY;

export function ActionQueue() {
  const navigate = useNavigate();
  const { data: episodes } = useEpisodes();
  const { data: appointmentRows } = useAppointments();
  const { data: sessionNotes } = useSessionNotes();
  const { data: results } = useResults();

  const items = useMemo(() => {
    const list: Item[] = [];
    const now = Date.now();

    // Rule 1 — pending appointments older than 24h
    for (const row of appointmentRows ?? []) {
      const a = row.appointment;
      if (a.status !== 'pending') continue;
      const created = new Date(a.createdAt).getTime();
      if (now - created < ONE_DAY) continue;
      const hours = Math.floor((now - created) / (60 * 60 * 1000));
      list.push({
        id: `pa-${a.id}`,
        rule: 'pending_appt',
        icon: <CalendarClock className="w-3.5 h-3.5" />,
        tone: 'amber',
        ruleLabel: '待确认',
        title: row.clientName ? `${row.clientName} 预约` : '预约待确认',
        detail: `已等待 ${hours} 小时`,
        onClick: () =>
          a.careEpisodeId
            ? navigate(`/episodes/${a.careEpisodeId}`)
            : navigate('/'),
        urgency: 1,
      });
    }

    // Rule 2 — completed appointments ended >24h with no associated session note
    const notesByAppt = new Set<string>();
    for (const n of sessionNotes ?? []) {
      if (n.appointmentId) notesByAppt.add(n.appointmentId);
    }
    for (const row of appointmentRows ?? []) {
      const a = row.appointment;
      if (a.status !== 'completed') continue;
      const ended = new Date(a.endTime).getTime();
      if (now - ended < ONE_DAY) continue;
      if (notesByAppt.has(a.id)) continue;
      const days = Math.max(1, Math.floor((now - ended) / ONE_DAY));
      list.push({
        id: `un-${a.id}`,
        rule: 'unwritten_note',
        icon: <FileEdit className="w-3.5 h-3.5" />,
        tone: 'orange',
        ruleLabel: '未写笔记',
        title: row.clientName ? `${row.clientName} 会谈` : '会谈笔记未写',
        detail: `结束 ${days} 天仍未归档`,
        onClick: () =>
          a.careEpisodeId
            ? navigate(`/episodes/${a.careEpisodeId}`)
            : navigate('/'),
        urgency: 2,
      });
    }

    // Rule 3 — high-risk episode + updatedAt >14 days
    for (const e of episodes ?? []) {
      if (e.status !== 'active') continue;
      if (e.currentRisk !== 'level_3' && e.currentRisk !== 'level_4') continue;
      const lastUpdated = new Date(e.updatedAt).getTime();
      if (now - lastUpdated < FOURTEEN_DAYS) continue;
      const days = Math.floor((now - lastUpdated) / ONE_DAY);
      const clientName = (e as any).client?.name || '来访者';
      const tone: Tone = e.currentRisk === 'level_4' ? 'red' : 'orange';
      list.push({
        id: `hr-${e.id}`,
        rule: 'high_risk_stale',
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
        tone,
        ruleLabel: e.currentRisk === 'level_4' ? 'L4 紧急' : 'L3 高风险',
        title: clientName,
        detail: `${days} 天未更新`,
        onClick: () => navigate(`/episodes/${e.id}`),
        urgency: e.currentRisk === 'level_4' ? 0 : 3,
      });
    }

    // Rule 4 — assessment score up ≥20% per user × assessment
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
        list.push({
          id: `su-${latest.id}`,
          rule: 'score_up',
          icon: <TrendingUp className="w-3.5 h-3.5" />,
          tone: 'blue',
          ruleLabel: '分数上升',
          title: `测评分数上升 ${Math.round(delta * 100)}%`,
          detail: `${prev.totalScore} → ${latest.totalScore}`,
          onClick: () => navigate('/assessments'),
          urgency: 4,
        });
      }
    }

    list.sort((a, b) => a.urgency - b.urgency);
    return list;
  }, [appointmentRows, sessionNotes, episodes, results, navigate]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col w-full min-h-0">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
          需要处理
          {items.length > 0 && (
            <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
              {items.length}
            </span>
          )}
        </h3>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-sm text-slate-400 gap-2">
            <Inbox className="w-6 h-6 text-slate-300" />
            🎉 今日没有积压事项
          </div>
        ) : (
          <ul className="space-y-1.5">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={it.onClick}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 transition text-left"
                >
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs flex-shrink-0 ${
                      TONE_MAP[it.tone]
                    }`}
                  >
                    {it.icon}
                    {it.ruleLabel}
                  </span>
                  <span className="text-sm text-slate-700 truncate flex-1">
                    {it.title}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">{it.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

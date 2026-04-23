import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarX, User } from 'lucide-react';
import { useAppointments } from '../../../api/useCounseling';

/**
 * 今日时间线 —— counselor 首页 col-1。
 *
 * 展示今日所有预约按时间升序的轴：当前时刻一条横线；已过去的预约 dim；
 * 点击任一条跳到 `/episodes/{careEpisodeId}`（episode 详情/工作台）。
 *
 * 为什么不直接复用 Workstation：col-1 的视角是"今天一天的时轴"，Workstation
 * 是"所有预约按日期分组并可筛状态"。两者数据同源但展示维度不同，
 * counselor 打开首页同时关心"今天这一天" 和"更广的积压"。
 */

const TYPE_LABELS: Record<string, string> = {
  online: '线上',
  offline: '线下',
  phone: '电话',
};

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  pending: { text: '待确认', cls: 'bg-amber-50 text-amber-700' },
  confirmed: { text: '已确认', cls: 'bg-blue-50 text-blue-700' },
  completed: { text: '已完成', cls: 'bg-emerald-50 text-emerald-700' },
  cancelled: { text: '已取消', cls: 'bg-slate-100 text-slate-400' },
  no_show: { text: '未到场', cls: 'bg-red-50 text-red-700' },
};

export function TodayTimeline() {
  const navigate = useNavigate();
  const { data: rows } = useAppointments();

  const todayItems = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
    const items = (rows ?? [])
      .filter((r) => {
        const t = new Date(r.appointment.startTime).getTime();
        return t >= startOfDay && t < endOfDay;
      })
      .sort(
        (a, b) =>
          new Date(a.appointment.startTime).getTime() -
          new Date(b.appointment.startTime).getTime(),
      );
    return items;
  }, [rows]);

  const now = Date.now();
  const nextIdx = todayItems.findIndex(
    (it) => new Date(it.appointment.endTime).getTime() >= now,
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col w-full min-h-0">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-base font-bold text-slate-900">今日时间线</h3>
        <span className="text-xs text-slate-400">{todayItems.length} 场</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {todayItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-sm text-slate-400 gap-2">
            <CalendarX className="w-6 h-6 text-slate-300" />
            今日无预约
          </div>
        ) : (
          <ul className="space-y-2 relative">
            {todayItems.map((it, idx) => {
              const a = it.appointment;
              const end = new Date(a.endTime).getTime();
              const start = new Date(a.startTime).getTime();
              const isPast = end < now;
              const isCurrent = start <= now && end >= now;
              const status = STATUS_LABELS[a.status] ?? STATUS_LABELS.pending;
              const canClick = !!a.careEpisodeId;
              const timeLabel = new Date(a.startTime).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <React.Fragment key={a.id}>
                  {idx === nextIdx && nextIdx > 0 && !isCurrent && (
                    <NowMarker />
                  )}
                  <li>
                    <button
                      type="button"
                      disabled={!canClick}
                      onClick={() => canClick && navigate(`/episodes/${a.careEpisodeId}`)}
                      className={`w-full text-left flex items-center gap-3 px-2 py-2 rounded-lg transition ${
                        canClick
                          ? 'hover:bg-slate-50 cursor-pointer'
                          : 'cursor-default'
                      } ${isPast ? 'opacity-50' : ''} ${
                        isCurrent ? 'bg-brand-50 border border-brand-200' : ''
                      }`}
                    >
                      <div className="flex-shrink-0 w-14 text-sm font-semibold tabular-nums text-slate-700">
                        {timeLabel}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="text-sm text-slate-800 truncate">
                            {it.clientName || '未知来访者'}
                          </span>
                          {a.type && (
                            <span className="text-xs text-slate-400">
                              · {TYPE_LABELS[a.type] || a.type}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${status.cls}`}
                      >
                        {status.text}
                      </span>
                    </button>
                  </li>
                </React.Fragment>
              );
            })}
            {nextIdx === -1 && todayItems.length > 0 && (
              <NowMarker label="今日已结束" />
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function NowMarker({ label = '现在' }: { label?: string }) {
  return (
    <li className="flex items-center gap-2 py-1" aria-hidden="true">
      <span className="text-xs font-medium text-brand-600 flex-shrink-0">{label}</span>
      <div className="flex-1 h-px bg-brand-300" />
    </li>
  );
}

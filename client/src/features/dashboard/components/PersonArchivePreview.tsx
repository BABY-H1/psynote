import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderArchive, Activity, Layers, BookOpen, ClipboardList } from 'lucide-react';
import { usePeople } from '../../../api/usePersonArchive';

/**
 * Phase 6 — Dashboard "档案库 · 过去" preview widget.
 *
 * Shows the top 5 most recently active people in the org, each row a clickable
 * link to their full archive at `/delivery/people/:userId`. Designed to slot
 * into the home page `ArchiveSection` (Phase 1) alongside or in place of the
 * existing `RecentInteractions` (which is service-centric, not person-centric).
 */
export function PersonArchivePreview() {
  const navigate = useNavigate();
  const { data, isLoading } = usePeople();
  const top = (data?.items ?? []).slice(0, 5);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
          对象档案
          {data?.items.length ? (
            <span className="text-xs text-slate-400 font-normal">共 {data.items.length} 人</span>
          ) : null}
        </h3>
        <button
          type="button"
          onClick={() => navigate('/delivery?type=archive')}
          className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
        >
          全部 <FolderArchive className="w-3.5 h-3.5" />
        </button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-slate-400">加载中...</div>
      ) : top.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400">暂无对象</div>
      ) : (
        <ul className="space-y-1.5">
          {top.map((p) => (
            <li key={p.userId}>
              <button
                type="button"
                onClick={() => navigate(`/delivery/people/${p.userId}`)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition text-left"
              >
                <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-700 truncate">{p.name}</div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                    {p.counts.counseling > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Activity className="w-2.5 h-2.5" /> {p.counts.counseling}
                      </span>
                    )}
                    {p.counts.group > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Layers className="w-2.5 h-2.5" /> {p.counts.group}
                      </span>
                    )}
                    {p.counts.course > 0 && (
                      <span className="flex items-center gap-0.5">
                        <BookOpen className="w-2.5 h-2.5" /> {p.counts.course}
                      </span>
                    )}
                    {p.counts.assessment > 0 && (
                      <span className="flex items-center gap-0.5">
                        <ClipboardList className="w-2.5 h-2.5" /> {p.counts.assessment}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{formatRelative(p.lastActivityAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 月前`;
  return `${Math.floor(days / 365)} 年前`;
}

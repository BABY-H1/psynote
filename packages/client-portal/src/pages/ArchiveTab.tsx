import React, { useState } from 'react';
import { FileText, Folder, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMyResults } from '@client/api/useClientPortal';
import { useMyTimeline } from '@client/api/useClientPortal';
import { PageLoading, RiskBadge } from '@client/shared/components';
import { RISK_LABELS } from '@client/features/assessment/constants';
import { Timeline } from '@client/features/counseling/components/Timeline';
import { SectionHeader } from '../components/SectionHeader';

/**
 * Phase 8c — ArchiveTab: "past" — 测评历史 + 完整时间线。
 *
 * Two sections:
 *   1. 测评历史 — list of assessment results, expandable to show total score,
 *      risk level, dimension scores. Merged from the old MyReports page.
 *   2. 健康时间线 — complete chronological timeline via the client
 *      Timeline component, which shows all care events (appointments,
 *      session notes, assessments, consents, …).
 *
 * Future extension: a "已结案个案回顾" section showing historical care
 * episodes that have status='closed'. The current /client/dashboard endpoint
 * only returns the single active episode, so surfacing closed episodes
 * would require a new endpoint. Deferred to post-Phase 8c.
 */
export function ArchiveTab() {
  const { data: results, isLoading: resultsLoading } = useMyResults();
  const { data: timeline, isLoading: timelineLoading } = useMyTimeline();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const navigate = useNavigate();

  if (resultsLoading || timelineLoading) {
    return <PageLoading />;
  }

  const hasResults = results && results.length > 0;
  const hasTimeline = timeline && timeline.length > 0;

  return (
    <div className="space-y-8">
      {/* 测评历史 */}
      <section>
        <SectionHeader title="测评历史" count={results?.length ?? 0} />
        {!hasResults ? (
          <EmptyRow
            icon={<FileText className="w-5 h-5 text-slate-400" />}
            title="暂无测评报告"
            subtitle="完成测评后，报告会保存在这里"
          />
        ) : (
          <div className="space-y-2">
            {results!.map((r: any) => {
              const isExpanded = expandedId === r.id;
              const dims = Object.entries(r.dimensionScores || {});
              return (
                <div
                  key={r.id}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          测评报告
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {new Date(r.createdAt).toLocaleDateString('zh-CN')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-mono text-slate-600">
                        {r.totalScore} 分
                      </span>
                      {r.riskLevel && <RiskBadge level={r.riskLevel} />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-100 p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-50 rounded-xl p-3 text-center">
                          <div className="text-2xl font-bold text-slate-900">
                            {r.totalScore}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">总分</div>
                        </div>
                        {r.riskLevel && (
                          <div className="bg-slate-50 rounded-xl p-3 text-center">
                            <div className="text-2xl font-bold text-slate-900">
                              {RISK_LABELS[r.riskLevel as keyof typeof RISK_LABELS] ?? r.riskLevel}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              风险等级
                            </div>
                          </div>
                        )}
                      </div>

                      {dims.length > 0 && (
                        <div>
                          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                            维度得分
                          </div>
                          <div className="space-y-1.5">
                            {dims.map(([dimId, score]) => (
                              <div
                                key={dimId}
                                className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2"
                              >
                                <span className="text-xs text-slate-700 truncate max-w-[65%]">
                                  {dimId}
                                </span>
                                <span className="text-xs font-mono text-slate-600">
                                  {String(score)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Phase 9β — link to detail page with full report + AI interpretation */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/portal/archive/results/${r.id}`);
                        }}
                        className="w-full mt-2 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl flex items-center justify-center gap-1"
                      >
                        查看完整报告
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 完整时间线 */}
      <section>
        <SectionHeader title="健康时间线" />
        {!hasTimeline ? (
          <EmptyRow
            icon={<Folder className="w-5 h-5 text-slate-400" />}
            title="暂无历史记录"
            subtitle="开始服务后，所有事件会在这里按时间排列"
          />
        ) : (
          <Timeline events={timeline || []} isLoading={false} />
        )}
      </section>
    </div>
  );
}

function EmptyRow({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center bg-white">
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="text-xs text-slate-400 mt-1">{subtitle}</div>
    </div>
  );
}

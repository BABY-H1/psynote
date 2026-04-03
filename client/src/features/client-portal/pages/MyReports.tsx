import React, { useState } from 'react';
import { useMyResults } from '../../../api/useClientPortal';
import { PageLoading, EmptyState, RiskBadge } from '../../../shared/components';
import { RISK_LABELS } from '../../assessment/constants';
import { FileText, Download } from 'lucide-react';

export function MyReports() {
  const { data: results, isLoading } = useMyResults();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) return <PageLoading />;

  if (!results || results.length === 0) {
    return <EmptyState title="暂无测评报告" description="完成测评后，报告将在这里显示" />;
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-900 mb-6">我的报告</h2>
      <div className="space-y-3">
        {results.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
              className="w-full p-4 text-left hover:bg-slate-50 transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-brand-600" />
                  <span className="text-sm font-medium text-slate-700">测评报告</span>
                  <span className="text-xs text-slate-400">
                    {new Date(r.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-slate-600">{r.totalScore} 分</span>
                  {r.riskLevel && <RiskBadge level={r.riskLevel} />}
                </div>
              </div>
            </button>

            {expandedId === r.id && (
              <div className="border-t border-slate-100 p-5 space-y-4">
                {/* Score summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-slate-900">{r.totalScore}</div>
                    <div className="text-xs text-slate-500">总分</div>
                  </div>
                  {r.riskLevel && (
                    <div className="bg-slate-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-slate-900">{RISK_LABELS[r.riskLevel] || r.riskLevel}</div>
                      <div className="text-xs text-slate-500">风险等级</div>
                    </div>
                  )}
                </div>

                {/* Dimension scores */}
                {Object.entries(r.dimensionScores || {}).length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-slate-500">维度得分</span>
                    <div className="mt-2 space-y-2">
                      {Object.entries(r.dimensionScores).map(([dimId, score]) => (
                        <div key={dimId} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                          <span className="text-sm text-slate-700">{dimId.slice(0, 16)}</span>
                          <span className="text-sm font-mono text-slate-600">{score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Note: PDF download requires report to be generated first */}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

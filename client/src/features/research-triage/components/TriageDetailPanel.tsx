import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Sparkles, FileText } from 'lucide-react';
import { DEFAULT_TRIAGE_CONFIG } from '@psynote/shared';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import type { TriageCandidateRow } from '../../../api/useResearchTriage';
import { TriageActionBar } from './TriageActionBar';

interface ResultDetail {
  id: string;
  totalScore: string | null;
  riskLevel: string | null;
  dimensionScores: Record<string, number> | unknown[];
  aiInterpretation: string | null;
  recommendations: Array<{ title?: string; rationale?: string; suggestedAction?: string }>;
  createdAt: string;
}

/**
 * Right-pane detail for a selected triage row. Shows basic info, total
 * score, AI recommendations, and the TriageActionBar. Fetches the full
 * result only when we have a resultId (manual candidates may not).
 */
export function TriageDetailPanel({
  row,
  onCleared,
  onActionDone,
}: {
  row: TriageCandidateRow | null;
  onCleared: () => void;
  onActionDone: () => void;
}) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const resultQuery = useQuery({
    queryKey: ['assessment-result', orgId, row?.resultId],
    queryFn: () => api.get<ResultDetail>(`/orgs/${orgId}/results/${row!.resultId}`),
    enabled: !!orgId && !!row?.resultId,
  });

  if (!row) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl h-full flex items-center justify-center text-slate-400 text-sm">
        从左侧选择一位待研判对象
      </div>
    );
  }

  const level = row.riskLevel
    ? DEFAULT_TRIAGE_CONFIG.levels.find((l) => l.key === row.riskLevel)
    : undefined;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 truncate">
              {row.userName ?? '(匿名来访者)'}
            </h3>
            {level && (
              <span
                className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                style={{ backgroundColor: level.color + '22', color: level.color }}
              >
                {level.label}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            {row.assessmentTitle ?? row.suggestion ?? '—'}
            {row.totalScore != null && <span className="ml-2">· 总分 {row.totalScore}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onCleared}
          className="text-slate-400 hover:text-slate-600 p-1"
          aria-label="关闭详情"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        <Section title="基本信息" icon={<FileText className="w-3.5 h-3.5" />}>
          <dl className="grid grid-cols-2 gap-y-1 text-xs">
            <Dt>来源</Dt>
            <Dd>{row.source === 'manual' ? '咨询师手工' : '筛查测评'}</Dd>
            <Dt>创建时间</Dt>
            <Dd>{new Date(row.createdAt).toLocaleString('zh-CN')}</Dd>
            {row.priority && (<><Dt>优先级</Dt><Dd>{row.priority}</Dd></>)}
            {row.candidateStatus && (<><Dt>候选状态</Dt><Dd>{row.candidateStatus}</Dd></>)}
          </dl>
        </Section>

        {row.suggestion && (
          <Section title="候选建议">
            <p className="text-xs text-slate-600 leading-relaxed">{row.suggestion}</p>
          </Section>
        )}

        {resultQuery.data && (
          <>
            {resultQuery.data.aiInterpretation && (
              <Section title="AI 解读">
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {resultQuery.data.aiInterpretation}
                </p>
              </Section>
            )}

            {resultQuery.data.recommendations && resultQuery.data.recommendations.length > 0 && (
              <Section title="AI 建议" icon={<Sparkles className="w-3.5 h-3.5" />}>
                <div className="space-y-2">
                  {resultQuery.data.recommendations.map((r, i) => (
                    <div
                      key={i}
                      className="border border-brand-100 bg-brand-50/60 rounded-lg p-2.5 text-xs"
                    >
                      {r.title && (
                        <div className="font-semibold text-brand-700 mb-0.5">{r.title}</div>
                      )}
                      {r.rationale && (
                        <p className="text-slate-600 leading-relaxed">{r.rationale}</p>
                      )}
                      {r.suggestedAction && (
                        <p className="text-slate-700 mt-1">
                          <span className="font-semibold">建议动作：</span>{r.suggestedAction}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>

      {/* Action bar */}
      <TriageActionBar row={row} onActionDone={onActionDone} />
    </div>
  );
}

function Section({
  title, icon, children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1 mb-1.5">
        {icon}{title}
      </h4>
      {children}
    </section>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-slate-400">{children}</dt>;
}
function Dd({ children }: { children: React.ReactNode }) {
  return <dd className="text-slate-700">{children}</dd>;
}

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X, Sparkles, FileText, CheckCircle2, ArrowRight } from 'lucide-react';
import { DEFAULT_TRIAGE_CONFIG } from '@psynote/shared';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { useToast } from '../../../shared/components';
import {
  useCreateFollowupEpisode,
  type TriageCandidateRow,
} from '../../../api/useResearchTriage';
import { useCrisisCase, useCrisisCaseByEpisode } from '../../../api/useCrisisCase';
import { TriageActionBar } from './TriageActionBar';
import { CrisisChecklistPanel } from '../../counseling/components/CrisisChecklistPanel';
import { InstancePickerPanel } from './InstancePickerPanel';

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
 * Right-pane detail for a selected triage row.
 *
 * Phase J: 双模视图.
 *   - 默认: header + 基本信息 / AI 解读 / AI 建议 + TriageActionBar (4 按钮)
 *   - 危机模式 (crisis_candidate accepted, 有关联 episode 和 crisisCase):
 *       compact header + CrisisChecklistPanel inline (清单 5 步 + 提交督导 + 签字)
 *       已结案 (stage='closed') 时顶部显示绿色 banner + "开后续咨询 episode" 按钮
 *   - 切换源: row.resolvedRefType + row.resolvedRefId (db 反查) 或 onCrisisStarted
 *     上抛的临时 episodeId (本次 accept 立即生效, 等 list refetch 后被 row 字段覆盖)
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
  const navigate = useNavigate();
  const { toast } = useToast();
  const createFollowup = useCreateFollowupEpisode();

  // Phase J: 接 ActionBar 上抛的 episodeId (本次刚 accept 立即生效).
  // row reload 完成后会被 row.resolvedRefId (crisisCaseId) 覆盖.
  const [freshCrisisEpisodeId, setFreshCrisisEpisodeId] = useState<string | null>(null);
  // Phase J 后续: inline picker 模式. null = 默认显示测评结果, 否则 body
  // 区域切到对应 picker (用户从 ActionBar 点 "课程" / "团辅" 触发).
  const [pickerMode, setPickerMode] = useState<'course' | 'group' | null>(null);
  useEffect(() => {
    setFreshCrisisEpisodeId(null);
    setPickerMode(null);
  }, [row?.resultId, row?.candidateId]);

  // 两条 lookup 路径:
  //   1. row 持久化: crisis_candidate accepted → resolvedRefType='crisis_case',
  //      resolvedRefId=crisisCaseId (workflow.routes.ts crisis 分支 stamp 的)
  //      → 用 useCrisisCase(crisisCaseId) 直接拿 case (含 episodeId 字段)
  //   2. ActionBar 上抛: 本次 accept 拿到的 episodeId
  //      → 用 useCrisisCaseByEpisode(episodeId) 反查
  // 先 row 后 fresh (持久化优先, refresh 安全).
  const rowCrisisCaseId =
    row?.candidateKind === 'crisis_candidate' &&
    row?.resolvedRefType === 'crisis_case' &&
    row?.resolvedRefId
      ? row.resolvedRefId
      : null;
  const { data: crisisFromRow } = useCrisisCase(rowCrisisCaseId);
  const { data: crisisFromFresh } = useCrisisCaseByEpisode(
    rowCrisisCaseId ? null : freshCrisisEpisodeId,
  );
  const crisisCase = crisisFromRow ?? crisisFromFresh ?? null;
  const crisisEpisodeId = crisisCase?.episodeId ?? null;

  const resultQuery = useQuery({
    queryKey: ['assessment-result', orgId, row?.resultId],
    queryFn: () => api.get<ResultDetail>(`/orgs/${orgId}/results/${row!.resultId}`),
    enabled: !!orgId && !!row?.resultId && !crisisCase, // 危机模式不需要 result 详情
  });

  if (!row) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-sm">
        从左侧选择一位待研判对象
      </div>
    );
  }

  // Phase J 危机模式分支 -----------------------------------------------------
  if (crisisCase && crisisEpisodeId) {
    const isClosed = crisisCase.stage === 'closed';
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Compact header */}
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 truncate">
                {row.userName ?? '(匿名来访者)'}
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                危机
              </span>
              {row.totalScore != null && (
                <span className="text-[11px] text-slate-500">总分 {row.totalScore}</span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {row.assessmentTitle ?? '—'}
              <span className="ml-2">{new Date(row.createdAt).toLocaleString('zh-CN')}</span>
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

        {/* Closed banner */}
        {isClosed && row.userId && (
          <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-100 flex items-center gap-3 flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <div className="flex-1 text-xs text-emerald-800">
              <div className="font-medium">危机案件已结案</div>
              <div className="text-emerald-700 mt-0.5">
                如客户需要后续治疗, 可创建一个新的随访 episode
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const ep = await createFollowup.mutateAsync({
                    clientId: row.userId!,
                    sourceCrisisCaseId: crisisCase.id,
                  });
                  toast('已创建后续咨询 episode', 'success');
                  navigate(`/episodes/${ep.id}`);
                } catch (err) {
                  toast((err as Error).message || '创建失败', 'error');
                }
              }}
              disabled={createFollowup.isPending}
              className="flex items-center gap-1 text-xs bg-white border border-emerald-300 text-emerald-700 px-2.5 py-1 rounded-lg hover:bg-emerald-50 disabled:opacity-50 flex-shrink-0"
            >
              {createFollowup.isPending ? '创建中…' : '+ 开后续咨询 episode'}
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* CrisisChecklistPanel inline. flex-1 min-h-0 让其内部 overflow-y-auto 生效. */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <CrisisChecklistPanel
            crisisCase={crisisCase}
            episodeId={crisisEpisodeId}
            clientId={row.userId ?? ''}
            clientName={row.userName ?? undefined}
          />
        </div>
      </div>
    );
  }
  // ------------------------------------------------------------------------

  const level = row.riskLevel
    ? DEFAULT_TRIAGE_CONFIG.levels.find((l) => l.key === row.riskLevel)
    : undefined;

  return (
    <div className="h-full flex flex-col overflow-hidden">
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

      {/* Body — pickerMode 决定显示测评结果 / 课程 picker / 团辅 picker */}
      {pickerMode ? (
        <InstancePickerPanel
          kind={pickerMode}
          row={row}
          onClose={() => setPickerMode(null)}
          onPickDone={() => {
            // 报名 + accept 成功后, 触发 list / buckets refetch 让 row 状态
            // 反映到列表 (变 "已处理")
            onActionDone();
            // setSelectedRow(null) 由父级 onActionDone 之外控制, 这里不主动清
          }}
        />
      ) : (
      <>
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
      </>
      )}

      {/* Action bar — picker 打开时也保留, 用户可以再点别的按钮切到不同 picker */}
      <TriageActionBar
        row={row}
        onActionDone={onActionDone}
        onCrisisStarted={(episodeId) => {
          // Phase J: 接 ActionBar 上抛, 立即切到 inline 危机视图. 等 row reload
          // 拿到 row.resolvedRefId 后, derive 优先用持久化字段, 不依赖此 state.
          setFreshCrisisEpisodeId(episodeId);
        }}
        onPickerOpen={(kind) => setPickerMode(kind)}
      />
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

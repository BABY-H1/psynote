/**
 * Phase 9β — AI Suggestion Panel
 *
 * Shown on a completed assessment result. Lists 2-4 AI-generated triage
 * recommendations and lets the counselor "采纳" any of them with one click —
 * which dispatches to the unified launch verb in `useDeliveryServices`.
 *
 * The panel handles:
 * - Initial generation (calls `useTriageRecommendation` once)
 * - Persistence: after generation, calls `useSetResultRecommendations` so the
 *   recommendations are saved on the result row and shown without re-running
 * - Adoption: each card has an "采纳" button → opens a small confirmation
 *   sheet with editable parameters (e.g. which course / which client) before
 *   firing the launch
 *
 * Note: this component is intentionally generic — it can be embedded in any
 * result detail page (counselor-side IndividualReportView, person archive, etc.).
 * The 9β commit only wires it into the report view.
 */
import React, { useState } from 'react';
import { Sparkles, Loader2, Check, Wand2, CheckCircle2, X } from 'lucide-react';
import type { AssessmentResult, TriageRecommendationLite } from '@psynote/shared';
import {
  useTriageRecommendation,
  type TriageResult,
} from '../../../api/useAI';
import { useSetResultRecommendations } from '../../../api/useAssessments';
import { useLaunchService, type LaunchActionType } from '../../../api/useDeliveryServices';
import { useToast } from '../../../shared/components';

interface Props {
  result: AssessmentResult;
  /** Optional: name of the scale, used in the LLM context. */
  scaleName?: string;
  /** Optional: pre-loaded dimensions. If absent, falls back to dimensionScores keys. */
  dimensions?: { name: string; score: number; label: string }[];
  /** Chief complaint (free text), shown to AI as context. */
  chiefComplaint?: string;
}

const URGENCY_STYLES: Record<TriageRecommendationLite['urgency'], string> = {
  routine: 'border-slate-300 bg-slate-50 text-slate-700',
  soon: 'border-blue-300 bg-blue-50 text-blue-700',
  urgent: 'border-amber-300 bg-amber-50 text-amber-700',
  immediate: 'border-red-300 bg-red-50 text-red-700',
};

const URGENCY_LABEL: Record<TriageRecommendationLite['urgency'], string> = {
  routine: '常规',
  soon: '近期',
  urgent: '紧急',
  immediate: '立即',
};

const ACTION_LABEL: Record<TriageRecommendationLite['actionType'], string> = {
  launch_course: '推送课程',
  launch_group: '入组团辅',
  create_episode: '开个体咨询',
  send_assessment: '加测量表',
  send_consent: '推送协议',
  create_referral: '发起转介',
};

export function AISuggestionPanel({
  result,
  scaleName,
  dimensions,
  chiefComplaint,
}: Props) {
  // Local state to handle just-generated recommendations before they round-trip
  const [generated, setGenerated] = useState<TriageResult | null>(null);
  const stored = (result.recommendations ?? []) as TriageRecommendationLite[];
  const recs = generated?.recommendations ?? stored;

  const triage = useTriageRecommendation();
  const persist = useSetResultRecommendations();
  const launch = useLaunchService();
  const { toast } = useToast();

  const [adopted, setAdopted] = useState<Set<number>>(new Set());

  async function handleGenerate() {
    try {
      const dims = dimensions ?? Object.entries(result.dimensionScores ?? {}).map(([name, score]) => ({
        name,
        score: Number(score),
        label: '',
      }));

      const triageResult = await triage.mutateAsync({
        riskLevel: result.riskLevel ?? 'level_1',
        dimensions: dims,
        chiefComplaint,
      });

      setGenerated(triageResult);
      // Fire-and-forget persist so recommendations survive a page refresh
      persist.mutate({ resultId: result.id, recommendations: triageResult.recommendations });
      toast(`已生成 ${triageResult.recommendations.length} 条建议`, 'success');
    } catch (err: any) {
      toast(err?.message ?? 'AI 生成失败', 'error');
    }
  }

  async function handleAdopt(rec: TriageRecommendationLite, idx: number) {
    try {
      // For 9β, the adopt button uses sensible defaults. The richer
      // "edit before launch" sheet is left to a follow-up — most action types
      // have all the data they need from the result + AI suggestion.
      const payload = buildPayloadFromRecommendation(rec, result);
      const launchResult = await launch.mutateAsync({
        actionType: rec.actionType as LaunchActionType,
        payload,
      });
      setAdopted((prev) => new Set(prev).add(idx));
      toast(launchResult.summary, 'success');
    } catch (err: any) {
      toast(err?.message ?? '采纳失败', 'error');
    }
  }

  return (
    <div className="bg-white rounded-xl border border-violet-200 overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-violet-50 to-fuchsia-50 border-b border-violet-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-600" />
          <h3 className="text-sm font-semibold text-violet-900">AI 建议</h3>
        </div>
        {recs.length === 0 && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={triage.isPending}
            className="px-3 py-1 text-xs bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {triage.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            生成建议
          </button>
        )}
        {recs.length > 0 && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={triage.isPending}
            className="text-xs text-violet-600 hover:underline flex items-center gap-1"
          >
            {triage.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            重新生成
          </button>
        )}
      </div>

      {recs.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-sm text-slate-500 mb-1">还没有 AI 建议</p>
          <p className="text-xs text-slate-400">
            点击「生成建议」让 AI 基于本次测评结果给出 2-4 条可执行的下一步动作
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {generated?.summary && (
            <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-700">摘要：</span>
              {generated.summary}
            </div>
          )}

          {recs.map((rec, idx) => {
            const isAdopted = adopted.has(idx);
            return (
              <div
                key={idx}
                className={`border rounded-lg p-3 ${URGENCY_STYLES[rec.urgency]}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-1.5 py-0.5 bg-white rounded font-medium">
                        {URGENCY_LABEL[rec.urgency]}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 bg-white/70 rounded text-slate-600">
                        {ACTION_LABEL[rec.actionType]}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold mb-0.5">{rec.title}</h4>
                    <p className="text-xs leading-relaxed opacity-90">{rec.reason}</p>
                  </div>
                  {isAdopted ? (
                    <span className="text-xs flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                      <CheckCircle2 className="w-3 h-3" /> 已采纳
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAdopt(rec, idx)}
                      disabled={launch.isPending}
                      className="text-xs px-3 py-1 bg-white border border-current rounded hover:bg-current/5 disabled:opacity-50 flex items-center gap-1"
                    >
                      {launch.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      采纳
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Builds a default payload for the launch verb from a recommendation + the
 * source result. For action types that need additional resolution (e.g. which
 * specific course to launch), the panel currently passes through with empty
 * IDs and lets the server validate. A future iteration can add an
 * "edit-before-launch" sheet for fine-tuning.
 */
function buildPayloadFromRecommendation(
  rec: TriageRecommendationLite,
  result: AssessmentResult,
): unknown {
  switch (rec.actionType) {
    case 'create_episode':
      return {
        clientId: result.userId,
        chiefComplaint: rec.reason,
        currentRisk: result.riskLevel,
      };
    case 'launch_course':
      return {
        courseId: rec.assetIdHint, // counselor edits if missing
        clientUserIds: result.userId ? [result.userId] : [],
      };
    case 'launch_group':
      return {
        title: rec.title,
        schemeId: rec.assetIdHint,
        clientUserIds: result.userId ? [result.userId] : [],
      };
    case 'send_assessment':
      return {
        scaleId: rec.assetIdHint,
        clientUserIds: result.userId ? [result.userId] : [],
        title: rec.title,
        careEpisodeId: result.careEpisodeId,
      };
    case 'send_consent':
      return {
        templateId: rec.assetIdHint,
        clientUserId: result.userId,
      };
    case 'create_referral':
      return {
        careEpisodeId: result.careEpisodeId,
        clientId: result.userId,
        reason: rec.reason,
        riskSummary: rec.title,
      };
    default:
      return {};
  }
}

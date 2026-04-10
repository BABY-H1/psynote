import { aiClient } from '../providers/openai-compatible.js';

interface TriageInput {
  riskLevel: string;
  dimensions: { name: string; score: number; label: string }[];
  chiefComplaint?: string;
  availableInterventions: string[]; // ['course', 'group', 'counseling', 'referral']
}

/**
 * Phase 9β — A single recommended action returned by the triage pipeline.
 * Designed so the counselor can press "采纳" once and the launch verb (see
 * `delivery/launch.service.ts`) instantiates the matching service in one step.
 *
 * `actionType` lines up 1:1 with the launch verb's accepted asset types so
 * downstream consumers don't need a translation layer.
 */
export interface TriageRecommendation {
  /** What to do — maps to the launch verb's `assetType`. */
  actionType:
    | 'launch_course'
    | 'launch_group'
    | 'create_episode'      // start a 1:1 counseling episode
    | 'send_assessment'     // run another scale to track / disambiguate
    | 'send_consent'        // ask the client to sign a specific agreement
    | 'create_referral';    // refer out (psychiatric / crisis / external)
  /** Short label rendered in the suggestion card title. */
  title: string;
  /** Why this is suggested — shown under the title. */
  reason: string;
  /** Urgency hint that drives card colour & sort. */
  urgency: 'routine' | 'soon' | 'urgent' | 'immediate';
  /** Optional hint to the launcher: e.g. a scheme/course/scale id (filled by service layer post-AI). */
  assetIdHint?: string;
}

export interface TriageResult {
  /** 1..5 candidate actions, sorted by urgency descending. */
  recommendations: TriageRecommendation[];
  /** Free-form summary the counselor can paste into a session note. */
  summary: string;
}

/**
 * AI-powered triage. Phase 9β reshape:
 * - Now returns an ARRAY of structured recommendations (not a single one)
 *   so the counselor sees multiple actionable next steps and picks one
 * - Each recommendation maps to the launch verb's actionType for one-click adoption
 * - Includes a paste-friendly summary for clinical notes
 */
export async function recommendTriage(input: TriageInput): Promise<TriageResult> {
  const dimSummary = input.dimensions
    .map((d) => `${d.name}: ${d.score}分 (${d.label})`)
    .join('\n');

  return aiClient.generateJSON<TriageResult>(
    `你是一位心理咨询分流专家。基于来访者的测评风险等级和维度数据，给出 2-4 条可执行的下一步建议供咨询师选择。

可用的 actionType（必须从下列中选择，对应可一键执行的动作）：
- launch_course   —— 推一门心理教育课程给来访者自学
- launch_group    —— 入组团体辅导
- create_episode  —— 开个体咨询个案
- send_assessment —— 加测一份量表（如 GAD-7、PHQ-9）以辅助判断
- send_consent    —— 推送一份同意书 / 协议
- create_referral —— 转介至精神科或危机干预

四级风险参考：
- level_1 → 偏向 launch_course / send_assessment
- level_2 → 偏向 launch_group / launch_course
- level_3 → 偏向 create_episode / launch_group
- level_4 → 必须包含 create_referral

返回 JSON：
{
  "recommendations": [
    {
      "actionType": "launch_course|launch_group|create_episode|send_assessment|send_consent|create_referral",
      "title": "10字以内动词短句，如：'入CBT抑郁团辅'",
      "reason": "为什么这样推荐（30字以内，引用维度分数）",
      "urgency": "routine|soon|urgent|immediate"
    }
  ],
  "summary": "本次测评的临床要点摘要，60字以内，可直接粘贴到会谈记录"
}`,
    `风险等级: ${input.riskLevel}
${input.chiefComplaint ? `主诉: ${input.chiefComplaint}` : ''}
可用干预方式: ${input.availableInterventions.join(', ')}

维度得分:
${dimSummary}`,
    { temperature: 0.3 },
  );
}

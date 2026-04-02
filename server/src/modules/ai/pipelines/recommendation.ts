import { aiClient } from '../providers/openai-compatible.js';

interface RecommendationInput {
  riskLevel: string;
  dimensions: { name: string; score: number; label: string }[];
  interventionType?: string;
  availableCourses?: { id: string; title: string; category: string }[];
  availableGroups?: { id: string; title: string; category: string }[];
}

interface RecommendationResult {
  message: string;
  suggestedCourseIds: string[];
  suggestedGroupIds: string[];
  selfCareAdvice: string[];
}

/**
 * Generate personalized recommendations for the client portal.
 */
export async function generateRecommendations(input: RecommendationInput): Promise<RecommendationResult> {
  const dimSummary = input.dimensions
    .map((d) => `${d.name}: ${d.score}分 (${d.label})`)
    .join('\n');

  const coursesStr = input.availableCourses?.length
    ? input.availableCourses.map((c) => `[${c.id}] ${c.title} (${c.category})`).join('\n')
    : '暂无可用课程';

  const groupsStr = input.availableGroups?.length
    ? input.availableGroups.map((g) => `[${g.id}] ${g.title} (${g.category})`).join('\n')
    : '暂无可用团辅';

  return aiClient.generateJSON<RecommendationResult>(
    `你是一位心理健康自助顾问。根据来访者的测评数据，推荐合适的课程和团辅活动。

返回JSON格式：
{
  "message": "一段温暖的个性化推荐语（50字以内，用"你"称呼）",
  "suggestedCourseIds": ["匹配的课程ID"],
  "suggestedGroupIds": ["匹配的团辅ID"],
  "selfCareAdvice": ["自助建议1", "自助建议2", "自助建议3"]
}

注意：
- 只推荐ID列表中存在的课程/团辅
- 自助建议要具体可行
- 语气温暖鼓励，避免标签化`,
    `风险等级: ${input.riskLevel}
当前干预方式: ${input.interventionType || '未分配'}

维度得分:
${dimSummary}

可用课程:
${coursesStr}

可用团辅:
${groupsStr}`,
    { temperature: 0.6 },
  );
}

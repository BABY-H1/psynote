import { useState } from 'react';
import { useUpdateReportNarrative } from '../../../api/useAssessments';
import { useInterpretResult } from '../../../api/useAI';
import { useToast } from '../../../shared/components';

/**
 * Shared hook for report advice editing with AI assist.
 * Used by IndividualReportView, TrendReportView, and GroupAdviceEditor.
 */
export function useReportAdvice(reportId: string, initialNarrative?: string) {
  const updateNarrative = useUpdateReportNarrative();
  const interpretMutation = useInterpretResult();
  const { toast } = useToast();
  const [advice, setAdvice] = useState(initialNarrative || '');

  const save = () => {
    updateNarrative.mutate({ reportId, narrative: advice }, {
      onSuccess: () => toast('综合建议已保存', 'success'),
      onError: () => toast('保存失败', 'error'),
    });
  };

  const generateAI = (payload: {
    scaleName: string;
    dimensions: { name: string; score: number; label: string; riskLevel?: string; advice?: string }[];
    totalScore: number;
    riskLevel?: string;
  }) => {
    interpretMutation.mutate(payload, {
      onSuccess: (data) => setAdvice(data.interpretation),
      onError: () => toast('AI 生成失败', 'error'),
    });
  };

  return {
    advice,
    setAdvice,
    save,
    generateAI,
    saving: updateNarrative.isPending,
    generating: interpretMutation.isPending,
  };
}

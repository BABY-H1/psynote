import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAssessment, usePublicSubmit } from '../../../api/useAssessments';
import { useScale } from '../../../api/useScales';
import { useInterpretResult } from '../../../api/useAI';
import type { AssessmentResult } from '@psynote/shared';
import { PageLoading, EmptyState, RiskBadge, useToast } from '../../../shared/components';

/**
 * Public assessment runner page.
 * Loads the assessment, presents scales sequentially, and submits answers.
 */
export function AssessmentRunner() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { data: assessment, isLoading } = useAssessment(assessmentId);
  const publicSubmit = usePublicSubmit();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [currentScaleIdx, setCurrentScaleIdx] = useState(0);
  const [result, setResult] = useState<AssessmentResult | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <PageLoading text="加载测评中..." />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <EmptyState
          title="测评未找到"
          description="此测评可能已被删除或链接无效"
        />
      </div>
    );
  }

  if (result) {
    return <ResultView result={result} />;
  }

  const scaleList = assessment.scales || [];
  const currentScale = scaleList[currentScaleIdx];

  const handleAnswer = (itemId: string, value: number) => {
    setAnswers((prev) => ({ ...prev, [itemId]: value }));
  };

  const handleSubmit = async () => {
    const res = await publicSubmit.mutateAsync({
      assessmentId: assessment.id,
      answers,
    });
    setResult(res);
    toast('测评提交成功', 'success');
  };

  const isLastScale = currentScaleIdx === scaleList.length - 1;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">{assessment.title}</h1>
          {assessment.description && (
            <p className="text-slate-500 mt-2">{assessment.description}</p>
          )}
          {scaleList.length > 1 && (
            <div className="flex justify-center gap-1 mt-4">
              {scaleList.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-8 rounded-full ${
                    i <= currentScaleIdx ? 'bg-brand-600' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Scale items */}
        {currentScale && (
          <ScaleSection
            scaleId={currentScale.id}
            answers={answers}
            onAnswer={handleAnswer}
          />
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button
            type="button"
            onClick={() => setCurrentScaleIdx((i) => Math.max(0, i - 1))}
            disabled={currentScaleIdx === 0}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30"
          >
            上一部分
          </button>
          {isLastScale ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={publicSubmit.isPending}
              className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
            >
              {publicSubmit.isPending ? '提交中...' : '提交'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentScaleIdx((i) => i + 1)}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500"
            >
              下一部分
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ScaleSection({
  scaleId,
  answers,
  onAnswer,
}: {
  scaleId: string;
  answers: Record<string, number>;
  onAnswer: (itemId: string, value: number) => void;
}) {
  const { data: scale, isLoading } = useScale(scaleId);

  if (isLoading || !scale) {
    return <PageLoading text="加载量表中..." />;
  }

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-900">{scale.title}</h3>
        {scale.instructions && (
          <p className="text-sm text-slate-500 mt-2 bg-brand-50 p-4 rounded-lg">
            {scale.instructions}
          </p>
        )}
      </div>

      <div className="space-y-4">
        {(scale.items || []).map((item, idx) => (
          <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm font-medium text-slate-900 mb-3">
              {idx + 1}. {item.text}
            </p>
            <div className="flex flex-wrap gap-2">
              {item.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onAnswer(item.id, opt.value)}
                  className={`px-4 py-2 rounded-lg text-sm border transition ${
                    answers[item.id] === opt.value
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'border-slate-200 text-slate-700 hover:border-brand-300 hover:bg-brand-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultView({ result }: { result: AssessmentResult }) {
  const interpretMutation = useInterpretResult();
  const [aiInterpretation, setAiInterpretation] = useState<string>(
    result.aiInterpretation || '',
  );

  const hasRisk = !!result.riskLevel;

  const handleInterpret = () => {
    const dimensions = Object.entries(result.dimensionScores).map(
      ([name, score]) => ({ name, score, label: name }),
    );
    interpretMutation.mutate(
      {
        scaleName: result.assessmentId,
        dimensions,
        totalScore: result.totalScore,
        riskLevel: result.riskLevel,
      },
      {
        onSuccess: (data) => {
          setAiInterpretation(data.interpretation);
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="text-3xl mb-4">&#10003;</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">测评已完成</h2>
          <p className="text-slate-500 text-sm mb-6">感谢您的参与</p>

          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">总分</span>
              <span className="font-semibold text-slate-900">{result.totalScore}</span>
            </div>
            {hasRisk && (
              <div className="flex justify-between text-sm items-center">
                <span className="text-slate-500">风险等级</span>
                <RiskBadge level={result.riskLevel!} />
              </div>
            )}
          </div>

          {!aiInterpretation && (
            <button
              type="button"
              onClick={handleInterpret}
              disabled={interpretMutation.isPending}
              className="mt-6 w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition"
            >
              {interpretMutation.isPending ? '解读中...' : 'AI 智能解读'}
            </button>
          )}

          {interpretMutation.isError && (
            <p className="mt-3 text-xs text-red-500">
              解读失败，请稍后重试
            </p>
          )}

          {aiInterpretation && (
            <div className="mt-6 text-left bg-blue-50 border border-blue-100 rounded-xl p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-2">AI 智能解读</h4>
              <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-line">
                {aiInterpretation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

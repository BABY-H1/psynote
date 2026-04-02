import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAssessment, usePublicSubmit } from '../../../api/useAssessments';
import { useScale } from '../../../api/useScales';
import { useInterpretResult } from '../../../api/useAI';
import type { AssessmentResult, AssessmentBlock, DemographicField, CustomQuestion, ResultDisplayConfig } from '@psynote/shared';
import { PageLoading, EmptyState, RiskBadge, useToast } from '../../../shared/components';

export function AssessmentRunner() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { data: assessment, isLoading } = useAssessment(assessmentId);
  const publicSubmit = usePublicSubmit();
  const { toast } = useToast();

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [demographicData, setDemographicData] = useState<Record<string, unknown>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, unknown>>({});
  const [currentBlockIdx, setCurrentBlockIdx] = useState(0);
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
        <EmptyState title="测评未找到" description="此测评可能已被删除或链接无效" />
      </div>
    );
  }

  if (result) {
    const displayConfig = assessment.resultDisplay as ResultDisplayConfig | undefined;
    return <ResultView result={result} displayConfig={displayConfig} />;
  }

  // Use blocks if available, otherwise fall back to legacy scales
  const blocks = (assessment.blocks || []) as AssessmentBlock[];
  const hasBlocks = blocks.length > 0;

  const orderedBlocks: AssessmentBlock[] = hasBlocks
    ? [...blocks].sort((a, b) => a.sortOrder - b.sortOrder)
    : (assessment.scales || []).map((s, i) => ({
        id: s.id,
        type: 'scale' as const,
        sortOrder: i,
        scaleId: s.id,
      }));

  const currentBlock = orderedBlocks[currentBlockIdx];
  const isLastBlock = currentBlockIdx === orderedBlocks.length - 1;

  const handleSubmit = async () => {
    const res = await publicSubmit.mutateAsync({
      assessmentId: assessment.id,
      answers,
      demographicData,
      customAnswers,
    });
    setResult(res);
    toast('测评提交成功', 'success');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">{assessment.title}</h1>
          {assessment.description && (
            <p className="text-slate-500 mt-2">{assessment.description}</p>
          )}
          {orderedBlocks.length > 1 && (
            <div className="flex justify-center gap-1 mt-4">
              {orderedBlocks.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-8 rounded-full ${i <= currentBlockIdx ? 'bg-brand-600' : 'bg-slate-200'}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Block content */}
        {currentBlock && (
          <>
            {currentBlock.type === 'scale' && currentBlock.scaleId && (
              <ScaleSection scaleId={currentBlock.scaleId} answers={answers} onAnswer={(id, v) => setAnswers((p) => ({ ...p, [id]: v }))} />
            )}
            {currentBlock.type === 'demographics' && currentBlock.fields && (
              <DemographicsSection fields={currentBlock.fields} data={demographicData} onChange={setDemographicData} />
            )}
            {currentBlock.type === 'custom_questions' && currentBlock.questions && (
              <CustomQuestionsSection questions={currentBlock.questions} data={customAnswers} onChange={setCustomAnswers} />
            )}
          </>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => setCurrentBlockIdx((i) => Math.max(0, i - 1))}
            disabled={currentBlockIdx === 0}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30"
          >
            上一部分
          </button>
          {isLastBlock ? (
            <button onClick={handleSubmit} disabled={publicSubmit.isPending} className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50">
              {publicSubmit.isPending ? '提交中...' : '提交'}
            </button>
          ) : (
            <button onClick={() => setCurrentBlockIdx((i) => i + 1)} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500">
              下一部分
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ScaleSection({ scaleId, answers, onAnswer }: {
  scaleId: string;
  answers: Record<string, number>;
  onAnswer: (itemId: string, value: number) => void;
}) {
  const { data: scale, isLoading } = useScale(scaleId);
  if (isLoading || !scale) return <PageLoading text="加载量表中..." />;

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-900">{scale.title}</h3>
        {scale.instructions && (
          <p className="text-sm text-slate-500 mt-2 bg-brand-50 p-4 rounded-lg">{scale.instructions}</p>
        )}
      </div>
      <div className="space-y-4">
        {(scale.items || []).map((item, idx) => (
          <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm font-medium text-slate-900 mb-3">{idx + 1}. {item.text}</p>
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

function DemographicsSection({ fields, data, onChange }: {
  fields: DemographicField[];
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}) {
  const update = (id: string, value: unknown) => onChange({ ...data, [id]: value });

  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-900 mb-4">基本信息</h3>
      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.id} className="bg-white rounded-xl border border-slate-200 p-5">
            <label className="block text-sm font-medium text-slate-900 mb-2">
              {field.label}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {field.type === 'select' && field.options ? (
              <div className="flex flex-wrap gap-2">
                {field.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => update(field.id, opt)}
                    className={`px-4 py-2 rounded-lg text-sm border transition ${
                      data[field.id] === opt
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-slate-200 text-slate-700 hover:border-brand-300'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                value={String(data[field.id] || '')}
                onChange={(e) => update(field.id, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                required={field.required}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomQuestionsSection({ questions, data, onChange }: {
  questions: CustomQuestion[];
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}) {
  const update = (id: string, value: unknown) => onChange({ ...data, [id]: value });

  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-900 mb-4">补充问题</h3>
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm font-medium text-slate-900 mb-3">
              {idx + 1}. {q.text}
              {q.required && <span className="text-red-500 ml-0.5">*</span>}
            </p>

            {q.type === 'radio' && (
              <div className="flex flex-wrap gap-2">
                {(q.options || []).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => update(q.id, opt)}
                    className={`px-4 py-2 rounded-lg text-sm border transition ${
                      data[q.id] === opt
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-slate-200 text-slate-700 hover:border-brand-300'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {q.type === 'checkbox' && (
              <div className="flex flex-wrap gap-2">
                {(q.options || []).map((opt) => {
                  const selected = Array.isArray(data[q.id]) ? (data[q.id] as string[]).includes(opt) : false;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        const current = Array.isArray(data[q.id]) ? (data[q.id] as string[]) : [];
                        update(q.id, selected ? current.filter((v) => v !== opt) : [...current, opt]);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm border transition ${
                        selected
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'border-slate-200 text-slate-700 hover:border-brand-300'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === 'text' && (
              <input
                value={String(data[q.id] || '')}
                onChange={(e) => update(q.id, e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}

            {q.type === 'textarea' && (
              <textarea
                value={String(data[q.id] || '')}
                onChange={(e) => update(q.id, e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultView({ result, displayConfig }: {
  result: AssessmentResult;
  displayConfig?: ResultDisplayConfig;
}) {
  const interpretMutation = useInterpretResult();
  const [aiInterpretation, setAiInterpretation] = useState<string>(result.aiInterpretation || '');

  // If mode is 'none', show thank-you only
  if (displayConfig?.mode === 'none') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">测评已完成</h2>
          <p className="text-slate-500 text-sm">感谢您的参与！</p>
        </div>
      </div>
    );
  }

  const show = displayConfig?.show || ['totalScore', 'riskLevel'];
  const showItem = (key: string) => show.includes(key as any);

  const handleInterpret = () => {
    const dimensions = Object.entries(result.dimensionScores).map(
      ([name, score]) => ({ name, score, label: name }),
    );
    interpretMutation.mutate(
      { scaleName: result.assessmentId, dimensions, totalScore: result.totalScore, riskLevel: result.riskLevel },
      { onSuccess: (data) => setAiInterpretation(data.interpretation) },
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">测评已完成</h2>
          <p className="text-slate-500 text-sm mb-6">感谢您的参与</p>

          <div className="bg-slate-50 rounded-xl p-4 space-y-3 text-left">
            {showItem('totalScore') && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">总分</span>
                <span className="font-semibold text-slate-900">{result.totalScore}</span>
              </div>
            )}
            {showItem('riskLevel') && result.riskLevel && (
              <div className="flex justify-between text-sm items-center">
                <span className="text-slate-500">风险等级</span>
                <RiskBadge level={result.riskLevel} />
              </div>
            )}
            {showItem('dimensionScores') && Object.entries(result.dimensionScores).length > 0 && (
              <div className="space-y-1 pt-2 border-t border-slate-200">
                <span className="text-xs text-slate-400">维度得分</span>
                {Object.entries(result.dimensionScores).map(([dim, score]) => (
                  <div key={dim} className="flex justify-between text-sm">
                    <span className="text-slate-500 truncate">{dim.length > 20 ? dim.slice(0, 8) + '...' : dim}</span>
                    <span className="font-medium text-slate-700">{score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {showItem('aiInterpret') && !aiInterpretation && (
            <button
              onClick={handleInterpret}
              disabled={interpretMutation.isPending}
              className="mt-6 w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition"
            >
              {interpretMutation.isPending ? '解读中...' : 'AI 智能解读'}
            </button>
          )}

          {aiInterpretation && (
            <div className="mt-6 text-left bg-blue-50 border border-blue-100 rounded-xl p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-2">AI 智能解读</h4>
              <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-line">{aiInterpretation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

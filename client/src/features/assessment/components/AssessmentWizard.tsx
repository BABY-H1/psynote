import React, { useState } from 'react';
import type { AssessmentBlock, CustomQuestion, DemographicField, ResultDisplayConfig, ResultDisplayItem } from '@psynote/shared';
import { useScales } from '../../../api/useScales';
import { useCreateAssessment } from '../../../api/useAssessments';
import {
  ArrowLeft, ArrowRight, Check, Plus, Trash2, GripVertical,
  ClipboardList, FileText, ListChecks, Sparkles,
} from 'lucide-react';
import { useToast } from '../../../shared/components';

interface Props {
  onClose: () => void;
  onCreated: (assessmentId: string) => void;
}

const STEPS = ['基本信息', '内容编排', '发放设置', '结果展示'];

const DEMOGRAPHIC_PRESETS: DemographicField[] = [
  { id: 'gender', label: '性别', type: 'select', required: false, options: ['男', '女', '其他'] },
  { id: 'age', label: '年龄', type: 'number', required: false },
  { id: 'grade', label: '年级', type: 'select', required: false, options: ['大一', '大二', '大三', '大四', '研一', '研二', '研三'] },
  { id: 'class', label: '班级', type: 'text', required: false },
  { id: 'student_id', label: '学号', type: 'text', required: false },
  { id: 'department', label: '部门/院系', type: 'text', required: false },
];

const RESULT_DISPLAY_OPTIONS: { key: ResultDisplayItem; label: string }[] = [
  { key: 'totalScore', label: '总分' },
  { key: 'riskLevel', label: '风险等级' },
  { key: 'dimensionScores', label: '维度得分' },
  { key: 'interpretation', label: '解读文字' },
  { key: 'advice', label: '建议' },
];

const ASSESSMENT_TYPES = [
  { value: 'screening', label: '心理筛查', desc: '用于心理健康状况的初步筛查和风险识别' },
  { value: 'survey', label: '调查问卷', desc: '用于收集意见、满意度或其他调研信息' },
  { value: 'evaluation', label: '效果评估', desc: '用于干预前后的效果对比评估' },
  { value: 'other', label: '其他', desc: '其他类型的测评' },
];

export function AssessmentWizard({ onClose, onCreated }: Props) {
  const { data: scales } = useScales();
  const createAssessment = useCreateAssessment();
  const { toast } = useToast();

  const [step, setStep] = useState(0);

  // Step 1
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assessmentType, setAssessmentType] = useState('screening');

  // Step 2
  const [blocks, setBlocks] = useState<AssessmentBlock[]>([]);

  // Step 3
  const [collectMode, setCollectMode] = useState<string>('anonymous');

  // Step 4
  const [distributionMode, setDistributionMode] = useState('both');
  const [resultDisplay, setResultDisplay] = useState<ResultDisplayConfig>({
    mode: 'custom',
    show: ['totalScore', 'riskLevel', 'dimensionScores', 'interpretation', 'advice'],
  });

  const nextId = () => crypto.randomUUID();

  // Block management
  const addScaleBlock = (scaleId: string) => {
    if (blocks.some((b) => b.type === 'scale' && b.scaleId === scaleId)) return;
    setBlocks([...blocks, { id: nextId(), type: 'scale', sortOrder: blocks.length, scaleId }]);
  };

  const addDemographicsBlock = () => {
    if (blocks.some((b) => b.type === 'demographics')) return;
    setBlocks([...blocks, { id: nextId(), type: 'demographics', sortOrder: blocks.length, fields: [] }]);
  };

  const addCustomQuestionsBlock = () => {
    setBlocks([...blocks, {
      id: nextId(),
      type: 'custom_questions',
      sortOrder: blocks.length,
      questions: [{ id: nextId(), type: 'radio', text: '', required: false, options: ['选项1', '选项2'] }],
    }]);
  };

  const removeBlock = (blockId: string) => {
    setBlocks(blocks.filter((b) => b.id !== blockId).map((b, i) => ({ ...b, sortOrder: i })));
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    const updated = [...blocks];
    [updated[index], updated[newIdx]] = [updated[newIdx], updated[index]];
    setBlocks(updated.map((b, i) => ({ ...b, sortOrder: i })));
  };

  const updateBlock = (blockId: string, patch: Partial<AssessmentBlock>) => {
    setBlocks(blocks.map((b) => b.id === blockId ? { ...b, ...patch } : b));
  };

  // Submit
  const handleSubmit = async () => {
    const assessment = await createAssessment.mutateAsync({
      title,
      description: description || undefined,
      blocks,
      collectMode,
      resultDisplay,
    });
    toast('测评创建成功', 'success');
    onCreated(assessment.id);
  };

  const canProceed = () => {
    if (step === 0) return title.trim().length > 0;
    if (step === 1) return blocks.some((b) => b.type === 'scale');
    return true;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-slate-900">创建测评</h2>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div className={`flex-1 h-0.5 ${i <= step ? 'bg-brand-500' : 'bg-slate-200'}`} />}
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-sm hidden sm:block ${i <= step ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>{label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">
        {step === 0 && (
          <div className="space-y-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">测评名称</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：新生心理健康筛查" required className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">描述（可选）</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简要描述测评目的和对象" rows={3} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">测评类型</label>
              <div className="grid grid-cols-2 gap-2">
                {ASSESSMENT_TYPES.map((t) => (
                  <label key={t.value} className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition ${assessmentType === t.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name="assessmentType" value={t.value} checked={assessmentType === t.value} onChange={() => setAssessmentType(t.value)} className="mt-0.5" />
                    <div>
                      <span className="text-sm font-medium text-slate-900">{t.label}</span>
                      <p className="text-xs text-slate-500 mt-0.5">{t.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {/* Add block buttons */}
            <div className="flex flex-wrap gap-2">
              <div className="relative group">
                <button className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> 添加量表
                </button>
                <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 w-64 max-h-48 overflow-y-auto hidden group-focus-within:block">
                  {(scales || []).map((s) => (
                    <button key={s.id} onClick={() => addScaleBlock(s.id)} disabled={blocks.some((b) => b.type === 'scale' && b.scaleId === s.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                      {s.title}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={addDemographicsBlock} disabled={blocks.some((b) => b.type === 'demographics')} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> 人口学信息
              </button>
              <button onClick={addCustomQuestionsBlock} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> 自定义题目
              </button>
            </div>

            {/* Block list */}
            {blocks.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                点击上方按钮添加内容区块，至少需要一个量表
              </div>
            ) : (
              <div className="space-y-3">
                {blocks.map((block, idx) => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    index={idx}
                    total={blocks.length}
                    scales={scales || []}
                    onMove={(dir) => moveBlock(idx, dir)}
                    onRemove={() => removeBlock(block.id)}
                    onUpdate={(patch) => updateBlock(block.id, patch)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 max-w-xl">
            {/* Distribution mode */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">发放方式</label>
              <div className="space-y-2">
                {[
                  { value: 'public', label: '公开发放', desc: '生成公开链接和二维码，任何人可作答' },
                  { value: 'internal', label: '指定人员', desc: '从机构成员选择或导入名单，定向下发' },
                  { value: 'both', label: '两者都支持', desc: '同时生成公开链接，也可以内部定向下发' },
                ].map((opt) => (
                  <label key={opt.value} className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition ${distributionMode === opt.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name="distMode" value={opt.value} checked={distributionMode === opt.value} onChange={() => setDistributionMode(opt.value)} className="mt-0.5" />
                    <div>
                      <span className="text-sm font-medium text-slate-900">{opt.label}</span>
                      <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Collect mode */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">填写人身份收集</label>
              <div className="space-y-2">
                {[
                  { value: 'anonymous', label: '完全匿名', desc: '不收集身份信息' },
                  { value: 'optional_register', label: '可选留信息', desc: '作答后可选择留下联系方式' },
                  { value: 'require_register', label: '必须登录', desc: '作答前需注册/登录' },
                ].map((opt) => (
                  <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${collectMode === opt.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name="collectMode" value={opt.value} checked={collectMode === opt.value} onChange={() => setCollectMode(opt.value)} className="mt-0.5" />
                    <div>
                      <span className="text-sm font-medium text-slate-900">{opt.label}</span>
                      <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Import hint for internal mode */}
            {(distributionMode === 'internal' || distributionMode === 'both') && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                <p className="font-medium">指定人员发放</p>
                <p className="text-xs mt-1">创建后可在测评卡片的「发放」按钮中：从机构成员选择人员，或上传 Excel/CSV 名单批量导入。</p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">作答完成后展示内容</label>
              <div className="space-y-2">
                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${resultDisplay.mode === 'none' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="radio" name="resultMode" checked={resultDisplay.mode === 'none'} onChange={() => setResultDisplay({ mode: 'none', show: [] })} />
                  <div>
                    <span className="text-sm font-medium text-slate-900">不展示结果</span>
                    <p className="text-xs text-slate-500">仅显示"感谢参与"</p>
                  </div>
                </label>
                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${resultDisplay.mode === 'custom' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="radio" name="resultMode" checked={resultDisplay.mode === 'custom'} onChange={() => setResultDisplay({ mode: 'custom', show: ['totalScore', 'riskLevel', 'dimensionScores', 'interpretation', 'advice'] })} />
                  <div>
                    <span className="text-sm font-medium text-slate-900">自定义展示</span>
                    <p className="text-xs text-slate-500">选择要展示给作答者的内容项</p>
                  </div>
                </label>
              </div>
            </div>

            {resultDisplay.mode === 'custom' && (
              <div className="pl-8 space-y-2">
                {RESULT_DISPLAY_OPTIONS.map((opt) => (
                  <label key={opt.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={resultDisplay.show.includes(opt.key)}
                      onChange={(e) => {
                        setResultDisplay({
                          ...resultDisplay,
                          show: e.target.checked
                            ? [...resultDisplay.show, opt.key as ResultDisplayItem]
                            : resultDisplay.show.filter((k) => k !== opt.key),
                        });
                      }}
                      className="rounded"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8 pt-4 border-t border-slate-200">
        <button
          onClick={() => step === 0 ? onClose() : setStep(step - 1)}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
        >
          {step === 0 ? '取消' : '上一步'}
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
          >
            下一步 <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={createAssessment.isPending || !canProceed()}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
          >
            {createAssessment.isPending ? '创建中...' : '创建测评'}
          </button>
        )}
      </div>
    </div>
  );
}

function BlockCard({
  block,
  index,
  total,
  scales,
  onMove,
  onRemove,
  onUpdate,
}: {
  block: AssessmentBlock;
  index: number;
  total: number;
  scales: { id: string; title: string }[];
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<AssessmentBlock>) => void;
}) {
  const scaleName = block.scaleId ? scales.find((s) => s.id === block.scaleId)?.title : null;

  const typeIcons: Record<string, React.ReactNode> = {
    scale: <ClipboardList className="w-4 h-4 text-brand-600" />,
    demographics: <FileText className="w-4 h-4 text-emerald-600" />,
    custom_questions: <ListChecks className="w-4 h-4 text-amber-600" />,
  };

  const typeLabels: Record<string, string> = {
    scale: '量表',
    demographics: '人口学信息',
    custom_questions: '自定义题目',
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="text-slate-300 hover:text-slate-500 disabled:opacity-30">
            <GripVertical className="w-4 h-4" />
          </button>
        </div>

        {/* Type icon + label */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {typeIcons[block.type]}
          <span className="text-xs text-slate-400">{typeLabels[block.type]}</span>
          {block.type === 'scale' && scaleName && (
            <span className="text-sm font-medium text-slate-900 truncate">{scaleName}</span>
          )}
        </div>

        {/* Move + delete */}
        <div className="flex gap-1 shrink-0">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="p-1 text-slate-300 hover:text-slate-500 disabled:opacity-30 text-xs">上移</button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="p-1 text-slate-300 hover:text-slate-500 disabled:opacity-30 text-xs">下移</button>
          <button onClick={onRemove} className="p-1 text-slate-300 hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Demographics fields config */}
      {block.type === 'demographics' && (
        <DemographicsConfig
          fields={block.fields || []}
          onChange={(fields) => onUpdate({ fields })}
        />
      )}

      {/* Custom questions config */}
      {block.type === 'custom_questions' && (
        <CustomQuestionsConfig
          questions={block.questions || []}
          onChange={(questions) => onUpdate({ questions })}
        />
      )}
    </div>
  );
}

function DemographicsConfig({
  fields,
  onChange,
}: {
  fields: DemographicField[];
  onChange: (fields: DemographicField[]) => void;
}) {
  const togglePreset = (preset: DemographicField) => {
    const exists = fields.find((f) => f.id === preset.id);
    if (exists) {
      onChange(fields.filter((f) => f.id !== preset.id));
    } else {
      onChange([...fields, { ...preset }]);
    }
  };

  const toggleRequired = (fieldId: string) => {
    onChange(fields.map((f) => f.id === fieldId ? { ...f, required: !f.required } : f));
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
      <span className="text-xs text-slate-500">选择需要收集的字段：</span>
      <div className="flex flex-wrap gap-2">
        {DEMOGRAPHIC_PRESETS.map((preset) => {
          const active = fields.some((f) => f.id === preset.id);
          return (
            <button
              key={preset.id}
              onClick={() => togglePreset(preset)}
              className={`px-2.5 py-1 rounded-full text-xs transition ${
                active ? 'bg-brand-100 text-brand-700 border border-brand-300' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      {fields.length > 0 && (
        <div className="space-y-1 mt-2">
          {fields.map((f) => (
            <div key={f.id} className="flex items-center justify-between text-xs px-2 py-1">
              <span className="text-slate-600">{f.label}</span>
              <label className="flex items-center gap-1 text-slate-400 cursor-pointer">
                <input type="checkbox" checked={f.required} onChange={() => toggleRequired(f.id)} className="rounded" />
                必填
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomQuestionsConfig({
  questions,
  onChange,
}: {
  questions: CustomQuestion[];
  onChange: (questions: CustomQuestion[]) => void;
}) {
  const addQuestion = () => {
    onChange([...questions, {
      id: crypto.randomUUID(),
      type: 'radio',
      text: '',
      required: false,
      options: ['选项1', '选项2'],
    }]);
  };

  const removeQuestion = (qId: string) => {
    onChange(questions.filter((q) => q.id !== qId));
  };

  const updateQuestion = (qId: string, patch: Partial<CustomQuestion>) => {
    onChange(questions.map((q) => q.id === qId ? { ...q, ...patch } : q));
  };

  const addOption = (qId: string) => {
    onChange(questions.map((q) => q.id === qId ? { ...q, options: [...(q.options || []), `选项${(q.options?.length || 0) + 1}`] } : q));
  };

  const updateOption = (qId: string, oIdx: number, value: string) => {
    onChange(questions.map((q) => {
      if (q.id !== qId) return q;
      const opts = [...(q.options || [])];
      opts[oIdx] = value;
      return { ...q, options: opts };
    }));
  };

  const removeOption = (qId: string, oIdx: number) => {
    onChange(questions.map((q) => {
      if (q.id !== qId) return q;
      return { ...q, options: (q.options || []).filter((_, i) => i !== oIdx) };
    }));
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
      {questions.map((q, qi) => (
        <div key={q.id} className="bg-slate-50 rounded-lg p-3 space-y-2">
          <div className="flex gap-2 items-start">
            <span className="text-xs text-slate-400 mt-2">{qi + 1}.</span>
            <div className="flex-1 space-y-2">
              <input
                value={q.text}
                onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                placeholder="题目内容"
                className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex gap-2 items-center">
                <select
                  value={q.type}
                  onChange={(e) => updateQuestion(q.id, { type: e.target.value as CustomQuestion['type'] })}
                  className="px-2 py-1 border border-slate-200 rounded text-xs"
                >
                  <option value="radio">单选</option>
                  <option value="checkbox">多选</option>
                  <option value="text">填空</option>
                  <option value="textarea">简答</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer">
                  <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(q.id, { required: e.target.checked })} className="rounded" />
                  必填
                </label>
              </div>
              {(q.type === 'radio' || q.type === 'checkbox') && (
                <div className="space-y-1">
                  {(q.options || []).map((opt, oi) => (
                    <div key={oi} className="flex gap-1 items-center">
                      <input
                        value={opt}
                        onChange={(e) => updateOption(q.id, oi, e.target.value)}
                        className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs"
                      />
                      {(q.options?.length || 0) > 2 && (
                        <button onClick={() => removeOption(q.id, oi)} className="text-xs text-red-400 hover:text-red-600">x</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => addOption(q.id)} className="text-xs text-brand-600 hover:underline">+ 添加选项</button>
                </div>
              )}
            </div>
            <button onClick={() => removeQuestion(q.id)} className="text-slate-300 hover:text-red-500 mt-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      <button onClick={addQuestion} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
        <Plus className="w-3 h-3" /> 添加题目
      </button>
    </div>
  );
}

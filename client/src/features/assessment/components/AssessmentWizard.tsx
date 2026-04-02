import React, { useState, useRef, useEffect } from 'react';
import type { AssessmentBlock, CustomQuestion, DemographicField, ResultDisplayConfig, ResultDisplayItem, ScreeningRules, TrackingConfig } from '@psynote/shared';
import { useScales, useScale } from '../../../api/useScales';
import { useAssessment, useCreateAssessment, useUpdateAssessment } from '../../../api/useAssessments';
import { useConfigureScreeningRules } from '../../../api/useAI';
import {
  ArrowLeft, ArrowRight, Check, Plus, Trash2, GripVertical,
  ClipboardList, FileText, ListChecks, Send, Loader2, Sparkles, Save,
} from 'lucide-react';
import { useToast } from '../../../shared/components';

interface Props {
  onClose: () => void;
  onCreated: (assessmentId: string) => void;
  /** If editing an existing assessment, pass its ID */
  editAssessmentId?: string;
  /** If editing a draft, pass its data */
  draft?: {
    id: string;
    title: string;
    description: string;
    assessmentType: string;
    blocks: AssessmentBlock[];
    collectMode: string;
    distributionMode: string;
    resultDisplay: ResultDisplayConfig;
    screeningRules: ScreeningRules;
    step: number;
  };
}

const ASSESSMENT_TYPES = [
  { value: 'screening', label: '心理筛查', desc: '初步筛查和风险识别' },
  { value: 'intake', label: '入组筛选', desc: '判断是否符合入组/参与条件' },
  { value: 'tracking', label: '追踪评估', desc: '多次施测，追踪变化（前后测/随访）' },
  { value: 'survey', label: '调查问卷', desc: '收集意见、满意度等信息' },
];

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

export function AssessmentWizard({ onClose, onCreated, editAssessmentId, draft }: Props) {
  const { data: scales } = useScales();
  const { data: editData } = useAssessment(editAssessmentId);
  const createAssessment = useCreateAssessment();
  const updateAssessment = useUpdateAssessment();
  const { toast } = useToast();

  // Resolve initial data from editData or draft
  const init = editData || draft;
  const [step, setStep] = useState(draft?.step || 0);
  const [draftId, setDraftId] = useState<string | null>(editAssessmentId || draft?.id || null);

  // Step 1
  const [title, setTitle] = useState(init?.title || '');
  const [description, setDescription] = useState(init?.description || '');
  const [assessmentType, setAssessmentType] = useState((init as any)?.assessmentType || 'screening');

  // Step 2
  const [blocks, setBlocks] = useState<AssessmentBlock[]>((init as any)?.blocks || []);

  // Step 3 — rules (screening/intake) or tracking config
  const [screeningRules, setScreeningRules] = useState<ScreeningRules>(
    (init as any)?.screeningRules || { enabled: false, conditions: [], logic: 'OR' },
  );
  const [trackingConfig, setTrackingConfig] = useState<TrackingConfig>(
    (init as any)?.trackingConfig || { scheduleType: 'manual' },
  );

  // Step 4
  const [distributionMode, setDistributionMode] = useState((init as any)?.distributionMode || 'both');
  const [collectMode, setCollectMode] = useState((init as any)?.collectMode || 'anonymous');
  const [resultDisplay, setResultDisplay] = useState<ResultDisplayConfig>(
    (init as any)?.resultDisplay || { mode: 'custom', show: ['totalScore', 'riskLevel', 'dimensionScores', 'interpretation', 'advice'] },
  );

  // Populate state when editData loads
  const [loaded, setLoaded] = useState(!editAssessmentId);
  useEffect(() => {
    if (editData && !loaded) {
      setTitle(editData.title || '');
      setDescription(editData.description || '');
      setAssessmentType((editData as any).assessmentType || 'screening');
      setBlocks((editData as any).blocks || []);
      setScreeningRules((editData as any).screeningRules || { enabled: false, conditions: [], logic: 'OR' });
      setCollectMode((editData as any).collectMode || 'anonymous');
      setResultDisplay((editData as any).resultDisplay || { mode: 'custom', show: ['totalScore', 'riskLevel', 'dimensionScores', 'interpretation', 'advice'] });
      setLoaded(true);
    }
  }, [editData, loaded]);

  const needsRules = assessmentType === 'screening' || assessmentType === 'intake';
  const steps = ['基本信息', '内容编排', '规则配置', '发放与结果'];

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
      id: nextId(), type: 'custom_questions', sortOrder: blocks.length,
      questions: [{ id: nextId(), type: 'radio', text: '', required: false, options: ['选项1', '选项2'] }],
    }]);
  };
  const removeBlock = (blockId: string) => setBlocks(blocks.filter((b) => b.id !== blockId).map((b, i) => ({ ...b, sortOrder: i })));
  const moveBlock = (index: number, dir: -1 | 1) => {
    const ni = index + dir;
    if (ni < 0 || ni >= blocks.length) return;
    const u = [...blocks];
    [u[index], u[ni]] = [u[ni], u[index]];
    setBlocks(u.map((b, i) => ({ ...b, sortOrder: i })));
  };
  const updateBlock = (id: string, patch: Partial<AssessmentBlock>) => setBlocks(blocks.map((b) => b.id === id ? { ...b, ...patch } : b));

  // Map logical step to actual step considering dynamic steps
  const logicalStep = () => {
    if (!needsRules && step >= 2) return step + 1; // skip rules step
    return step;
  };

  // Save as draft
  const saveDraft = async () => {
    const data = {
      title: title || '未命名测评',
      description,
      assessmentType,
      blocks,
      collectMode,
      resultDisplay,
      screeningRules: needsRules ? screeningRules : undefined,
    };

    if (draftId) {
      await updateAssessment.mutateAsync({ assessmentId: draftId, ...data } as any);
      toast('草稿已保存', 'success');
    } else {
      const created = await createAssessment.mutateAsync({ ...data, status: 'draft' } as any);
      setDraftId(created.id);
      toast('草稿已保存', 'success');
    }
  };

  // Submit (create active assessment)
  const handleSubmit = async () => {
    const data = {
      title,
      description: description || undefined,
      assessmentType,
      blocks,
      collectMode,
      resultDisplay,
      screeningRules: needsRules ? screeningRules : undefined,
    };

    if (draftId) {
      await updateAssessment.mutateAsync({ assessmentId: draftId, ...data, status: 'active', isActive: true } as any);
      toast('测评已发布', 'success');
      onCreated(draftId);
    } else {
      const created = await createAssessment.mutateAsync({ ...data, status: 'active' } as any);
      toast('测评创建成功', 'success');
      onCreated(created.id);
    }
  };

  const canProceed = () => {
    if (step === 0) return title.trim().length > 0;
    if (step === 1) return blocks.some((b) => b.type === 'scale');
    return true;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-slate-900">
            {draftId ? '编辑测评' : '创建测评'}
          </h2>
          {draftId && (
            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">草稿</span>
          )}
        </div>
        <button
          onClick={saveDraft}
          disabled={createAssessment.isPending || updateAssessment.isPending}
          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center gap-1.5 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          保存草稿
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((label, i) => (
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
        {/* Step 1: Basic info */}
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
          </div>
        )}

        {/* Step 2: Content blocks */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative group">
                <button className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> 添加量表
                </button>
                <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 w-64 max-h-48 overflow-y-auto hidden group-focus-within:block">
                  {(scales || []).map((s) => (
                    <button key={s.id} onClick={() => addScaleBlock(s.id)} disabled={blocks.some((b) => b.type === 'scale' && b.scaleId === s.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">{s.title}</button>
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
            {blocks.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">点击上方按钮添加内容区块，至少需要一个量表</div>
            ) : (
              <div className="space-y-3">
                {blocks.map((block, idx) => (
                  <BlockCard key={block.id} block={block} index={idx} total={blocks.length} scales={scales || []}
                    onMove={(dir) => moveBlock(idx, dir)} onRemove={() => removeBlock(block.id)}
                    onUpdate={(patch) => updateBlock(block.id, patch)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Type selection + Rules configuration */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Type selection */}
            <div className="max-w-xl">
              <label className="block text-sm font-medium text-slate-700 mb-2">测评类型</label>
              <div className="space-y-2">
                {ASSESSMENT_TYPES.map((t) => (
                  <label key={t.value} className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition ${assessmentType === t.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name="assessmentType" value={t.value} checked={assessmentType === t.value} onChange={() => setAssessmentType(t.value)} className="mt-0.5" />
                    <div>
                      <span className="text-sm font-medium text-slate-900">{t.label}</span>
                      <p className="text-xs text-slate-500 mt-0.5">{t.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Config based on type */}
            {needsRules && (
              <ScreeningRulesStep
                assessmentType={assessmentType}
                blocks={blocks}
                scales={scales || []}
                rules={screeningRules}
                onRulesChange={setScreeningRules}
              />
            )}
            {assessmentType === 'tracking' && (
              <TrackingConfigStep config={trackingConfig} onChange={setTrackingConfig} />
            )}
            {assessmentType === 'survey' && (
              <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-500 max-w-xl">
                调查问卷无需额外配置，可直接进入下一步。
              </div>
            )}
          </div>
        )}

        {/* Last step: Distribution + Result display */}
        {step === steps.length - 1 && (
          <div className="space-y-6 max-w-xl">
            {/* Distribution mode */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">发放方式</label>
              <div className="space-y-2">
                {[
                  { value: 'public', label: '公开发放', desc: '生成链接和二维码' },
                  { value: 'internal', label: '指定人员', desc: '选择成员或导入名单' },
                  { value: 'both', label: '两者都支持', desc: '同时支持公开和定向' },
                ].map((opt) => (
                  <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${distributionMode === opt.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
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
              <label className="block text-sm font-medium text-slate-700 mb-2">身份收集</label>
              <div className="space-y-2">
                {[
                  { value: 'anonymous', label: '匿名', desc: '不收集身份信息' },
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
            {/* Result display */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">结果展示</label>
              <div className="space-y-2">
                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${resultDisplay.mode === 'none' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                  <input type="radio" name="resultMode" checked={resultDisplay.mode === 'none'} onChange={() => setResultDisplay({ mode: 'none', show: [] })} />
                  <span className="text-sm text-slate-900">不展示结果</span>
                </label>
                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${resultDisplay.mode === 'custom' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                  <input type="radio" name="resultMode" checked={resultDisplay.mode === 'custom'} onChange={() => setResultDisplay({ mode: 'custom', show: ['totalScore', 'riskLevel', 'dimensionScores', 'interpretation', 'advice'] })} />
                  <span className="text-sm text-slate-900">自定义展示</span>
                </label>
              </div>
              {resultDisplay.mode === 'custom' && (
                <div className="pl-8 mt-2 space-y-2">
                  {RESULT_DISPLAY_OPTIONS.map((opt) => (
                    <label key={opt.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={resultDisplay.show.includes(opt.key)} onChange={(e) => setResultDisplay({ ...resultDisplay, show: e.target.checked ? [...resultDisplay.show, opt.key] : resultDisplay.show.filter((k) => k !== opt.key) })} className="rounded" />
                      {opt.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8 pt-4 border-t border-slate-200">
        <button onClick={() => step === 0 ? onClose() : setStep(step - 1)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
          {step === 0 ? '取消' : '上一步'}
        </button>
        {step < steps.length - 1 ? (
          <button onClick={() => setStep(step + 1)} disabled={!canProceed()} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5">
            下一步 <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={createAssessment.isPending || updateAssessment.isPending || !canProceed()} className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50">
            {createAssessment.isPending || updateAssessment.isPending ? '创建中...' : '发布测评'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Screening Rules Step (AI Chat) ─────────────────────────────

// ─── Tracking Config Step ────────────────────────────────────────

function TrackingConfigStep({ config, onChange }: { config: TrackingConfig; onChange: (c: TrackingConfig) => void }) {
  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-semibold text-slate-900">发放计划</h3>
      </div>
      <p className="text-sm text-slate-500">追踪评估支持对同一人多次施测。选择发放方式：</p>

      <div className="space-y-2">
        <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition ${config.scheduleType === 'manual' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
          <input type="radio" name="scheduleType" checked={config.scheduleType === 'manual'} onChange={() => onChange({ scheduleType: 'manual' })} className="mt-0.5" />
          <div>
            <span className="text-sm font-medium text-slate-900">手动发放</span>
            <p className="text-xs text-slate-500 mt-0.5">每次在详情页手动点击「发起测评」，系统自动编号为第N次</p>
          </div>
        </label>
        <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition ${config.scheduleType === 'recurring' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
          <input type="radio" name="scheduleType" checked={config.scheduleType === 'recurring'} onChange={() => onChange({ scheduleType: 'recurring', recurring: config.recurring || { frequency: 'monthly' } })} className="mt-0.5" />
          <div>
            <span className="text-sm font-medium text-slate-900">定期自动发放</span>
            <p className="text-xs text-slate-500 mt-0.5">按设定周期自动发放给指定人员</p>
          </div>
        </label>
      </div>

      {config.scheduleType === 'recurring' && config.recurring && (
        <div className="bg-slate-50 rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">发放频率</label>
            <select
              value={config.recurring.frequency}
              onChange={(e) => onChange({ ...config, recurring: { ...config.recurring!, frequency: e.target.value as any } })}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="weekly">每周</option>
              <option value="biweekly">每两周</option>
              <option value="monthly">每月</option>
              <option value="quarterly">每季度</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">总次数（留空为不限）</label>
            <input
              type="number"
              min="1"
              value={config.recurring.count || ''}
              onChange={(e) => onChange({ ...config, recurring: { ...config.recurring!, count: e.target.value ? Number(e.target.value) : undefined } })}
              placeholder="如：8"
              className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input
              type="date"
              value={config.recurring.startDate || ''}
              onChange={(e) => onChange({ ...config, recurring: { ...config.recurring!, startDate: e.target.value || undefined } })}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Screening Rules Step (AI Chat) ─────────────────────────────

function ScreeningRulesStep({
  assessmentType, blocks, scales, rules, onRulesChange,
}: {
  assessmentType: string;
  blocks: AssessmentBlock[];
  scales: { id: string; title: string }[];
  rules: ScreeningRules;
  onRulesChange: (rules: ScreeningRules) => void;
}) {
  const chatMutation = useConfigureScreeningRules();
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [rulesGenerated, setRulesGenerated] = useState(rules.enabled);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get full scale data for context
  const scaleIds = blocks.filter((b) => b.type === 'scale' && b.scaleId).map((b) => b.scaleId!);
  const scaleQueries = scaleIds.map((id) => useScale(id));
  const fullScales = scaleQueries.filter((q) => q.data).map((q) => q.data!);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const typeLabel = assessmentType === 'screening' ? '筛查' : '入组筛选';

  const sendMessage = () => {
    const text = input.trim();
    if (!text || chatMutation.isPending) return;

    const userMsg = { role: 'user' as const, content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');

    const context = {
      assessmentType,
      scales: fullScales.map((s) => ({
        id: s.id,
        title: s.title,
        dimensions: (s.dimensions || []).map((d) => ({
          id: d.id, name: d.name,
          rules: d.rules?.map((r) => ({ minScore: Number(r.minScore), maxScore: Number(r.maxScore), label: r.label, riskLevel: r.riskLevel })),
        })),
        items: (s.items || []).map((it) => ({
          id: it.id, text: it.text, options: it.options as { label: string; value: number }[],
        })),
      })),
    };

    chatMutation.mutate({ messages: updated, context }, {
      onSuccess: (data) => {
        if (data.type === 'rules') {
          onRulesChange(data.rules as ScreeningRules);
          setRulesGenerated(true);
          setMessages((prev) => [...prev, { role: 'assistant', content: data.summary }]);
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
        }
      },
      onError: () => {
        setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，出现了错误，请重试。' }]);
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="font-semibold text-slate-900">AI 配置{typeLabel}规则</h3>
      </div>
      <p className="text-sm text-slate-500">
        与 AI 对话描述你的{typeLabel}标准，AI 会根据量表信息生成结构化规则。
      </p>

      {/* Chat area */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 h-72 overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-slate-400 text-center py-8">
            描述你的{typeLabel}需求，如"总分超过15分标记为高风险"或"第9题选2及以上需要关注"
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === 'user' ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-700'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-sm text-slate-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> AI 分析中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={`描述${typeLabel}条件...`}
          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          disabled={chatMutation.isPending}
        />
        <button onClick={sendMessage} disabled={!input.trim() || chatMutation.isPending} className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-50">
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* Generated rules preview */}
      {rulesGenerated && rules.conditions.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700 mb-2">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">规则已生成 ({rules.conditions.length} 条，逻辑: {rules.logic})</span>
          </div>
          <div className="space-y-1">
            {rules.conditions.map((c, i) => (
              <div key={c.id || i} className="text-xs text-green-800 bg-green-100 rounded px-2 py-1">
                {c.targetLabel || c.type} {c.operator} {c.value} → {c.flagLabel || c.flag}
              </div>
            ))}
          </div>
          <p className="text-xs text-green-600 mt-2">可继续对话修改规则，或点击下一步继续。</p>
        </div>
      )}

      {!rulesGenerated && (
        <button
          onClick={() => { onRulesChange({ enabled: false, conditions: [], logic: 'OR' }); }}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          跳过规则配置
        </button>
      )}
    </div>
  );
}

// ─── Block Card ─────────────────────────────────────────────────

function BlockCard({ block, index, total, scales, onMove, onRemove, onUpdate }: {
  block: AssessmentBlock; index: number; total: number; scales: { id: string; title: string }[];
  onMove: (dir: -1 | 1) => void; onRemove: () => void; onUpdate: (patch: Partial<AssessmentBlock>) => void;
}) {
  const scaleName = block.scaleId ? scales.find((s) => s.id === block.scaleId)?.title : null;
  const typeLabels: Record<string, string> = { scale: '量表', demographics: '人口学信息', custom_questions: '自定义题目' };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xs text-slate-400">{typeLabels[block.type]}</span>
          {block.type === 'scale' && scaleName && <span className="text-sm font-medium text-slate-900 truncate">{scaleName}</span>}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="p-1 text-slate-300 hover:text-slate-500 disabled:opacity-30 text-xs">上移</button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="p-1 text-slate-300 hover:text-slate-500 disabled:opacity-30 text-xs">下移</button>
          <button onClick={onRemove} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {block.type === 'demographics' && <DemographicsConfig fields={block.fields || []} onChange={(fields) => onUpdate({ fields })} />}
      {block.type === 'custom_questions' && <CustomQuestionsConfig questions={block.questions || []} onChange={(questions) => onUpdate({ questions })} />}
    </div>
  );
}

// ─── Demographics Config ────────────────────────────────────────

function DemographicsConfig({ fields, onChange }: { fields: DemographicField[]; onChange: (f: DemographicField[]) => void }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customType, setCustomType] = useState<'text' | 'number' | 'select' | 'date'>('text');
  const [customOptions, setCustomOptions] = useState('');

  const addCustomField = () => {
    if (!customLabel.trim()) return;
    const newField: DemographicField = {
      id: `custom_${crypto.randomUUID().slice(0, 8)}`,
      label: customLabel.trim(),
      type: customType,
      required: false,
      options: customType === 'select' ? customOptions.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : undefined,
    };
    onChange([...fields, newField]);
    setCustomLabel('');
    setCustomOptions('');
    setShowCustom(false);
  };

  const removeField = (id: string) => onChange(fields.filter((f) => f.id !== id));
  const isPreset = (id: string) => DEMOGRAPHIC_PRESETS.some((p) => p.id === id);

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
      {/* Preset fields */}
      <div>
        <span className="text-xs text-slate-500">预设字段：</span>
        <div className="flex flex-wrap gap-2 mt-1">
          {DEMOGRAPHIC_PRESETS.map((p) => {
            const active = fields.some((f) => f.id === p.id);
            return (
              <button key={p.id} onClick={() => onChange(active ? fields.filter((f) => f.id !== p.id) : [...fields, { ...p }])}
                className={`px-2.5 py-1 rounded-full text-xs transition ${active ? 'bg-brand-100 text-brand-700 border border-brand-300' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected fields with required toggle and delete */}
      {fields.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-slate-500">已选字段：</span>
          {fields.map((f) => (
            <div key={f.id} className="flex items-center justify-between text-xs px-2 py-1.5 bg-slate-50 rounded">
              <div className="flex items-center gap-2">
                <span className="text-slate-700 font-medium">{f.label}</span>
                <span className="text-slate-400">
                  {f.type === 'text' ? '文本' : f.type === 'number' ? '数字' : f.type === 'select' ? '下拉' : '日期'}
                </span>
                {f.type === 'select' && f.options && (
                  <span className="text-slate-400">({f.options.join('/')})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={f.required} onChange={() => onChange(fields.map((x) => x.id === f.id ? { ...x, required: !x.required } : x))} className="rounded" />
                  必填
                </label>
                <button onClick={() => removeField(f.id)} className="text-slate-300 hover:text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add custom field */}
      {!showCustom ? (
        <button onClick={() => setShowCustom(true)} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
          <Plus className="w-3 h-3" /> 自定义字段
        </button>
      ) : (
        <div className="bg-slate-50 rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="字段名称" className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <select value={customType} onChange={(e) => setCustomType(e.target.value as any)} className="px-2 py-1.5 border border-slate-200 rounded text-xs">
              <option value="text">文本</option>
              <option value="number">数字</option>
              <option value="select">下拉选择</option>
              <option value="date">日期</option>
            </select>
          </div>
          {customType === 'select' && (
            <input value={customOptions} onChange={(e) => setCustomOptions(e.target.value)} placeholder="选项（用逗号分隔，如：选项1，选项2）" className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCustom(false)} className="text-xs text-slate-400 hover:text-slate-600">取消</button>
            <button onClick={addCustomField} disabled={!customLabel.trim()} className="text-xs text-brand-600 hover:underline disabled:opacity-50">添加</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Custom Questions Config ────────────────────────────────────

function CustomQuestionsConfig({ questions, onChange }: { questions: CustomQuestion[]; onChange: (q: CustomQuestion[]) => void }) {
  const nextId = () => crypto.randomUUID();
  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
      {questions.map((q, qi) => (
        <div key={q.id} className="bg-slate-50 rounded-lg p-3 space-y-2">
          <div className="flex gap-2 items-start">
            <span className="text-xs text-slate-400 mt-2">{qi + 1}.</span>
            <div className="flex-1 space-y-2">
              <input value={q.text} onChange={(e) => onChange(questions.map((x) => x.id === q.id ? { ...x, text: e.target.value } : x))} placeholder="题目内容" className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <div className="flex gap-2 items-center">
                <select value={q.type} onChange={(e) => onChange(questions.map((x) => x.id === q.id ? { ...x, type: e.target.value as any } : x))} className="px-2 py-1 border border-slate-200 rounded text-xs">
                  <option value="radio">单选</option><option value="checkbox">多选</option><option value="text">填空</option><option value="textarea">简答</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={q.required} onChange={(e) => onChange(questions.map((x) => x.id === q.id ? { ...x, required: e.target.checked } : x))} className="rounded" />必填</label>
              </div>
              {(q.type === 'radio' || q.type === 'checkbox') && (
                <div className="space-y-1">
                  {(q.options || []).map((opt, oi) => (
                    <div key={oi} className="flex gap-1 items-center">
                      <input value={opt} onChange={(e) => { const opts = [...(q.options || [])]; opts[oi] = e.target.value; onChange(questions.map((x) => x.id === q.id ? { ...x, options: opts } : x)); }} className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs" />
                      {(q.options?.length || 0) > 2 && <button onClick={() => onChange(questions.map((x) => x.id === q.id ? { ...x, options: (x.options || []).filter((_, i) => i !== oi) } : x))} className="text-xs text-red-400">x</button>}
                    </div>
                  ))}
                  <button onClick={() => onChange(questions.map((x) => x.id === q.id ? { ...x, options: [...(x.options || []), `选项${(x.options?.length || 0) + 1}`] } : x))} className="text-xs text-brand-600 hover:underline">+ 选项</button>
                </div>
              )}
            </div>
            <button onClick={() => onChange(questions.filter((x) => x.id !== q.id))} className="text-slate-300 hover:text-red-500 mt-1"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...questions, { id: nextId(), type: 'radio', text: '', required: false, options: ['选项1', '选项2'] }])} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> 添加题目</button>
    </div>
  );
}

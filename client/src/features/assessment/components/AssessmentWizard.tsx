import React, { useState, useEffect } from 'react';
import type { AssessmentBlock, ResultDisplayConfig, ResultDisplayItem, ScreeningRules, TrackingConfig } from '@psynote/shared';
import { useScales } from '../../../api/useScales';
import { useAssessment, useCreateAssessment, useUpdateAssessment } from '../../../api/useAssessments';
import {
  ArrowLeft, ArrowRight, Check, Plus, Save,
} from 'lucide-react';
import { useToast } from '../../../shared/components';
import { BlockCard } from './wizard/BlockCard';
import { ScreeningRulesStep } from './wizard/ScreeningRulesStep';

interface Props {
  onClose: () => void;
  onCreated: (assessmentId: string) => void;
  editAssessmentId?: string;
  draft?: {
    id: string; title: string; description: string; assessmentType: string;
    blocks: AssessmentBlock[]; collectMode: string; distributionMode: string;
    resultDisplay: ResultDisplayConfig; screeningRules: ScreeningRules; step: number;
  };
}

const ASSESSMENT_TYPES = [
  { value: 'screening', label: '心理筛查', desc: '初步筛查和风险识别' },
  { value: 'intake', label: '入组筛选', desc: '判断是否���合入组/参与条件' },
  { value: 'tracking', label: '追踪评估', desc: '多次施测，追踪变化（前后测/随访）' },
  { value: 'survey', label: '调查问卷', desc: '收集意见、满意度等信息' },
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

  const init = editData || draft;
  const [step, setStep] = useState(draft?.step || 0);
  const [draftId, setDraftId] = useState<string | null>(editAssessmentId || draft?.id || null);

  // Step 1
  const [title, setTitle] = useState(init?.title || '');
  const [description, setDescription] = useState(init?.description || '');
  const [assessmentType, setAssessmentType] = useState((init as any)?.assessmentType || 'screening');

  // Step 2
  const [blocks, setBlocks] = useState<AssessmentBlock[]>((init as any)?.blocks || []);

  // Step 3
  const [screeningRules, setScreeningRules] = useState<ScreeningRules>(
    (init as any)?.screeningRules || { enabled: false, conditions: [], logic: 'OR' },
  );
  const [trackingConfig, setTrackingConfig] = useState<TrackingConfig>(
    (init as any)?.trackingConfig || { scheduleType: 'manual' },
  );

  // Step 4
  const [distributionMode, setDistributionMode] = useState((init as any)?.distributionMode || 'both');
  const [collectMode, setCollectMode] = useState((init as any)?.collectMode || 'anonymous');
  const [allowClientReport, setAllowClientReport] = useState((init as any)?.allowClientReport || false);
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

  // Block management
  const addScaleBlock = (scaleId: string) => {
    if (blocks.some((b) => b.type === 'scale' && b.scaleId === scaleId)) return;
    setBlocks([...blocks, { id: crypto.randomUUID(), type: 'scale', sortOrder: blocks.length, scaleId }]);
  };
  const addDemographicsBlock = () => {
    if (blocks.some((b) => b.type === 'demographics')) return;
    setBlocks([...blocks, { id: crypto.randomUUID(), type: 'demographics', sortOrder: blocks.length, fields: [] }]);
  };
  const addCustomQuestionsBlock = () => {
    setBlocks([...blocks, {
      id: crypto.randomUUID(), type: 'custom_questions', sortOrder: blocks.length,
      questions: [{ id: crypto.randomUUID(), type: 'radio', text: '', required: false, options: ['选项1', '选项2'] }],
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

  const saveDraft = async () => {
    const data = { title: title || '未命名测评', description, assessmentType, blocks, collectMode, resultDisplay, screeningRules: needsRules ? screeningRules : undefined };
    if (draftId) {
      await updateAssessment.mutateAsync({ assessmentId: draftId, ...data } as any);
      toast('草稿已保存', 'success');
    } else {
      const created = await createAssessment.mutateAsync({ ...data, status: 'draft' } as any);
      setDraftId(created.id);
      toast('草稿已保存', 'success');
    }
  };

  const handleSubmit = async () => {
    const data = { title, description: description || undefined, assessmentType, blocks, collectMode, resultDisplay, allowClientReport, screeningRules: needsRules ? screeningRules : undefined };
    if (draftId) {
      await updateAssessment.mutateAsync({ assessmentId: draftId, ...data, status: 'active', isActive: true } as any);
      toast('测评已发布', 'success');
      onCreated(draftId);
    } else {
      const created = await createAssessment.mutateAsync({ ...data, status: 'active' } as any);
      toast('测评���建成功', 'success');
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
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition"><ArrowLeft className="w-5 h-5" /></button>
          <h2 className="text-xl font-bold text-slate-900">{draftId ? '编辑测评' : '创建测评'}</h2>
          {draftId && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">草稿</span>}
        </div>
        <button onClick={saveDraft} disabled={createAssessment.isPending || updateAssessment.isPending}
          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center gap-1.5 disabled:opacity-50">
          <Save className="w-3.5 h-3.5" /> 保存草稿
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
              }`}>{i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}</div>
              <span className={`text-sm hidden sm:block ${i <= step ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>{label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">
        {step === 0 && <BasicInfoStep title={title} description={description} onTitleChange={setTitle} onDescriptionChange={setDescription} />}
        {step === 1 && <ContentStep blocks={blocks} scales={scales || []} onAddScale={addScaleBlock} onAddDemographics={addDemographicsBlock} onAddCustom={addCustomQuestionsBlock} onMove={moveBlock} onRemove={removeBlock} onUpdate={updateBlock} />}
        {step === 2 && <RulesStep assessmentType={assessmentType} needsRules={needsRules} blocks={blocks} scales={scales || []} screeningRules={screeningRules} trackingConfig={trackingConfig} onTypeChange={setAssessmentType} onRulesChange={setScreeningRules} onTrackingChange={setTrackingConfig} />}
        {step === steps.length - 1 && <DistributionStep distributionMode={distributionMode} collectMode={collectMode} resultDisplay={resultDisplay} allowClientReport={allowClientReport} onDistModeChange={setDistributionMode} onCollectModeChange={setCollectMode} onResultDisplayChange={setResultDisplay} onAllowClientReportChange={setAllowClientReport} />}
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

// ─── Step sub-components (kept inline since they're small + tightly coupled) ──

function BasicInfoStep({ title, description, onTitleChange, onDescriptionChange }: {
  title: string; description: string; onTitleChange: (v: string) => void; onDescriptionChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">测评名称</label>
        <input value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="如：新生心理健康筛查" required className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">描述（可选）</label>
        <textarea value={description} onChange={(e) => onDescriptionChange(e.target.value)} placeholder="简要描述测评目的和对象" rows={3} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>
    </div>
  );
}

function ContentStep({ blocks, scales, onAddScale, onAddDemographics, onAddCustom, onMove, onRemove, onUpdate }: {
  blocks: AssessmentBlock[]; scales: { id: string; title: string }[];
  onAddScale: (id: string) => void; onAddDemographics: () => void; onAddCustom: () => void;
  onMove: (i: number, d: -1 | 1) => void; onRemove: (id: string) => void; onUpdate: (id: string, p: Partial<AssessmentBlock>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative group">
          <button className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> 添加量表
          </button>
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 w-64 max-h-48 overflow-y-auto hidden group-focus-within:block">
            {scales.map((s) => (
              <button key={s.id} onClick={() => onAddScale(s.id)} disabled={blocks.some((b) => b.type === 'scale' && b.scaleId === s.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">{s.title}</button>
            ))}
          </div>
        </div>
        <button onClick={onAddDemographics} disabled={blocks.some((b) => b.type === 'demographics')} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-40">
          <Plus className="w-3.5 h-3.5" /> 人口学信息
        </button>
        <button onClick={onAddCustom} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> 自定义题目
        </button>
      </div>
      {blocks.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">点击上方按钮添加内容区块，至少需要一个量表</div>
      ) : (
        <div className="space-y-3">
          {blocks.map((block, idx) => (
            <BlockCard key={block.id} block={block} index={idx} total={blocks.length} scales={scales}
              onMove={(dir) => onMove(idx, dir)} onRemove={() => onRemove(block.id)}
              onUpdate={(patch) => onUpdate(block.id, patch)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RulesStep({ assessmentType, needsRules, blocks, scales, screeningRules, trackingConfig, onTypeChange, onRulesChange, onTrackingChange }: {
  assessmentType: string; needsRules: boolean; blocks: AssessmentBlock[]; scales: { id: string; title: string }[];
  screeningRules: ScreeningRules; trackingConfig: TrackingConfig;
  onTypeChange: (v: string) => void; onRulesChange: (r: ScreeningRules) => void; onTrackingChange: (c: TrackingConfig) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="max-w-xl">
        <label className="block text-sm font-medium text-slate-700 mb-2">测评类型</label>
        <div className="space-y-2">
          {ASSESSMENT_TYPES.map((t) => (
            <label key={t.value} className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition ${assessmentType === t.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input type="radio" name="assessmentType" value={t.value} checked={assessmentType === t.value} onChange={() => onTypeChange(t.value)} className="mt-0.5" />
              <div>
                <span className="text-sm font-medium text-slate-900">{t.label}</span>
                <p className="text-xs text-slate-500 mt-0.5">{t.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
      {needsRules && <ScreeningRulesStep assessmentType={assessmentType} blocks={blocks} scales={scales} rules={screeningRules} onRulesChange={onRulesChange} />}
      {assessmentType === 'tracking' && <TrackingConfigStep config={trackingConfig} onChange={onTrackingChange} />}
      {assessmentType === 'survey' && <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-500 max-w-xl">调查问卷无需额外配置，可直接进入下一步。</div>}
    </div>
  );
}

function TrackingConfigStep({ config, onChange }: { config: TrackingConfig; onChange: (c: TrackingConfig) => void }) {
  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center gap-2 mb-2"><h3 className="font-semibold text-slate-900">发放计划</h3></div>
      <p className="text-sm text-slate-500">追踪评估支持对同一人多次施测。选择发放方式：</p>
      <div className="space-y-2">
        <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition ${config.scheduleType === 'manual' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
          <input type="radio" name="scheduleType" checked={config.scheduleType === 'manual'} onChange={() => onChange({ scheduleType: 'manual' })} className="mt-0.5" />
          <div><span className="text-sm font-medium text-slate-900">手动发放</span><p className="text-xs text-slate-500 mt-0.5">每次在详情页手动点击「发起测评」，系统自动编号为第N次</p></div>
        </label>
        <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition ${config.scheduleType === 'recurring' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
          <input type="radio" name="scheduleType" checked={config.scheduleType === 'recurring'} onChange={() => onChange({ scheduleType: 'recurring', recurring: config.recurring || { frequency: 'monthly' } })} className="mt-0.5" />
          <div><span className="text-sm font-medium text-slate-900">定期自动发放</span><p className="text-xs text-slate-500 mt-0.5">按设定周期自动发放给指定人员</p></div>
        </label>
      </div>
      {config.scheduleType === 'recurring' && config.recurring && (
        <div className="bg-slate-50 rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">发放频率</label>
            <select value={config.recurring.frequency} onChange={(e) => onChange({ ...config, recurring: { ...config.recurring!, frequency: e.target.value as any } })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="weekly">每周</option><option value="biweekly">每两周</option><option value="monthly">每月</option><option value="quarterly">每季度</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">总次数（留空为不限）</label>
            <input type="number" min="1" value={config.recurring.count || ''} onChange={(e) => onChange({ ...config, recurring: { ...config.recurring!, count: e.target.value ? Number(e.target.value) : undefined } })} placeholder="如：8" className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input type="date" value={config.recurring.startDate || ''} onChange={(e) => onChange({ ...config, recurring: { ...config.recurring!, startDate: e.target.value || undefined } })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
      )}
    </div>
  );
}

function DistributionStep({ distributionMode, collectMode, resultDisplay, allowClientReport, onDistModeChange, onCollectModeChange, onResultDisplayChange, onAllowClientReportChange }: {
  distributionMode: string; collectMode: string; resultDisplay: ResultDisplayConfig; allowClientReport: boolean;
  onDistModeChange: (v: string) => void; onCollectModeChange: (v: string) => void; onResultDisplayChange: (v: ResultDisplayConfig) => void; onAllowClientReportChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">发放方式</label>
        <div className="space-y-2">
          {[{ value: 'public', label: '公开发放', desc: '生成链接和二维码' }, { value: 'internal', label: '指定人员', desc: '选择成员或导入名单' }, { value: 'both', label: '两者都支持', desc: '同时支持公开和定向' }].map((opt) => (
            <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${distributionMode === opt.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input type="radio" name="distMode" value={opt.value} checked={distributionMode === opt.value} onChange={() => onDistModeChange(opt.value)} className="mt-0.5" />
              <div><span className="text-sm font-medium text-slate-900">{opt.label}</span><p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p></div>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">身份收集</label>
        <div className="space-y-2">
          {[{ value: 'anonymous', label: '匿名', desc: '不收集身份信息' }, { value: 'optional_register', label: '可选留信息', desc: '作答后可选择留下联系方式' }, { value: 'require_register', label: '必须登录', desc: '作答前需注册/登录' }].map((opt) => (
            <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${collectMode === opt.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input type="radio" name="collectMode" value={opt.value} checked={collectMode === opt.value} onChange={() => onCollectModeChange(opt.value)} className="mt-0.5" />
              <div><span className="text-sm font-medium text-slate-900">{opt.label}</span><p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p></div>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">结果展示</label>
        <div className="space-y-2">
          <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${resultDisplay.mode === 'none' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
            <input type="radio" name="resultMode" checked={resultDisplay.mode === 'none'} onChange={() => onResultDisplayChange({ mode: 'none', show: [] })} />
            <span className="text-sm text-slate-900">不展示结果</span>
          </label>
          <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${resultDisplay.mode === 'custom' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
            <input type="radio" name="resultMode" checked={resultDisplay.mode === 'custom'} onChange={() => onResultDisplayChange({ mode: 'custom', show: ['totalScore', 'riskLevel', 'dimensionScores', 'interpretation', 'advice'] })} />
            <span className="text-sm text-slate-900">自定义展示</span>
          </label>
        </div>
        {resultDisplay.mode === 'custom' && (
          <div className="pl-8 mt-2 space-y-2">
            {RESULT_DISPLAY_OPTIONS.map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={resultDisplay.show.includes(opt.key)} onChange={(e) => onResultDisplayChange({ ...resultDisplay, show: e.target.checked ? [...resultDisplay.show, opt.key] : resultDisplay.show.filter((k) => k !== opt.key) })} className="rounded" />
                {opt.label}
              </label>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="flex items-center justify-between p-4 rounded-lg border border-slate-200 cursor-pointer hover:border-slate-300 transition">
          <div>
            <span className="text-sm font-medium text-slate-900">允许来访者查看报告</span>
            <p className="text-xs text-slate-500 mt-0.5">开启后，来访者可在个人门户中查看自己的测评报告</p>
          </div>
          <input type="checkbox" checked={allowClientReport} onChange={(e) => onAllowClientReportChange(e.target.checked)} className="w-5 h-5 rounded text-brand-600 focus:ring-brand-500" />
        </label>
      </div>
    </div>
  );
}

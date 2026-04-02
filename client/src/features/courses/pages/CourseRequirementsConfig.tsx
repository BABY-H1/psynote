import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCreateCourse, useUpdateCourse, useCourse } from '../../../api/useCourses';
import { useGenerateCourseBlueprint } from '../../../api/useCourseAuthoring';
import { useToast } from '../../../shared/components';
import type { CourseRequirementsConfig as RequirementsConfig } from '@psynote/shared';

// ─── Option Definitions ────────────────────────────────────────

const TARGET_AUDIENCE_OPTIONS = [
  { value: 'parent', label: '家长' },
  { value: 'student', label: '学生' },
  { value: 'counselor', label: '咨询师' },
  { value: 'teacher', label: '教师' },
];

const PROBLEM_TOPIC_OPTIONS = [
  { value: '厌学', label: '厌学' },
  { value: '休学', label: '休学' },
  { value: '情绪管理', label: '情绪管理' },
  { value: '沟通冲突', label: '沟通冲突' },
  { value: '自我认知', label: '自我认知' },
  { value: '亲子关系', label: '亲子关系' },
  { value: '考试焦虑', label: '考试焦虑' },
  { value: '人际关系', label: '人际关系' },
  { value: '自我成长', label: '自我成长' },
  { value: '生涯规划', label: '生涯规划' },
];

const PROBLEM_STAGE_OPTIONS = [
  { value: '预防期', label: '预防期' },
  { value: '早期', label: '早期' },
  { value: '冲突拉锯', label: '冲突拉锯' },
  { value: '休学适应', label: '休学适应' },
  { value: '恢复重建', label: '恢复重建' },
];

const DELIVERY_FORMAT_OPTIONS = [
  { value: 'micro_course', label: '微课' },
  { value: 'series', label: '系列课' },
  { value: 'group_facilitation', label: '团辅' },
  { value: 'workshop', label: '工作坊' },
  { value: 'parent_meeting', label: '家长会' },
  { value: 'bootcamp', label: '训练营' },
];

const SESSION_COUNT_OPTIONS = [
  { value: 1, label: '1 节' },
  { value: 4, label: '4 节' },
  { value: 6, label: '6 节' },
  { value: 8, label: '8 节' },
  { value: 0, label: '自定义' },
];

const SESSION_DURATION_OPTIONS = [
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '60 分钟' },
  { value: 90, label: '90 分钟' },
];

const COURSE_GOALS_OPTIONS = [
  { value: '认知提升', label: '认知提升' },
  { value: '态度调整', label: '态度调整' },
  { value: '技能训练', label: '技能训练' },
  { value: '行为执行', label: '行为执行' },
  { value: '家庭协作', label: '家庭协作' },
];

const THEORETICAL_FRAMEWORK_OPTIONS = [
  { value: 'CBT', label: 'CBT' },
  { value: 'ACT', label: 'ACT' },
  { value: '家庭系统', label: '家庭系统' },
  { value: 'ABA', label: 'ABA' },
  { value: '发展适应', label: '发展适应' },
  { value: '综合', label: '综合' },
];

const EXPRESSION_STYLE_OPTIONS = [
  { value: '专业型', label: '专业型' },
  { value: '温和陪伴型', label: '温和陪伴型' },
  { value: '机构招生型', label: '机构招生型' },
  { value: '学校宣教型', label: '学校宣教型' },
];

const RISK_LEVEL_OPTIONS = [
  { value: '低风险科普', label: '低风险科普' },
  { value: '中风险支持', label: '中风险支持' },
  { value: '需谨慎表述', label: '需谨慎表述' },
];

// ─── Component ─────────────────────────────────────────────────

export function CourseRequirementsConfig() {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const isEditing = !!courseId && courseId !== 'new';

  const { data: existingCourse } = useCourse(isEditing ? courseId : undefined);
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const generateBlueprint = useGenerateCourseBlueprint();
  const { toast } = useToast();

  const existing = existingCourse?.requirementsConfig;

  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [targetAudience, setTargetAudience] = useState(existing?.targetAudience ?? '');
  const [problemTopic, setProblemTopic] = useState(existing?.problemTopic ?? '');
  const [problemStage, setProblemStage] = useState(existing?.problemStage ?? '');
  const [deliveryFormat, setDeliveryFormat] = useState(existing?.deliveryFormat ?? '');
  const [sessionCountPreset, setSessionCountPreset] = useState<number>(existing?.sessionCount ?? 0);
  const [customSessionCount, setCustomSessionCount] = useState('');
  const [sessionDuration, setSessionDuration] = useState<number>(existing?.sessionDuration ?? 0);
  const [courseGoals, setCourseGoals] = useState<string[]>(existing?.courseGoals ?? []);
  const [theoreticalFramework, setTheoreticalFramework] = useState(existing?.theoreticalFramework ?? '');
  const [expressionStyle, setExpressionStyle] = useState(existing?.expressionStyle ?? '');
  const [riskLevel, setRiskLevel] = useState(existing?.riskLevel ?? '');
  const [caseExpanded, setCaseExpanded] = useState(false);
  const [linkedRiskLevel, setLinkedRiskLevel] = useState(existing?.linkedRiskLevel ?? '');
  const [linkedChiefComplaint, setLinkedChiefComplaint] = useState(existing?.linkedChiefComplaint ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Sync from existing course when loaded
  const [synced, setSynced] = useState(false);
  if (isEditing && existingCourse && !synced) {
    setTitle(existingCourse.title || '');
    const cfg = existingCourse.requirementsConfig;
    if (cfg) {
      setTargetAudience(cfg.targetAudience ?? '');
      setProblemTopic(cfg.problemTopic ?? '');
      setProblemStage(cfg.problemStage ?? '');
      setDeliveryFormat(cfg.deliveryFormat ?? '');
      const sc = cfg.sessionCount ?? 0;
      if ([1, 4, 6, 8].includes(sc)) {
        setSessionCountPreset(sc);
      } else if (sc > 0) {
        setSessionCountPreset(0);
        setCustomSessionCount(String(sc));
      }
      setSessionDuration(cfg.sessionDuration ?? 0);
      setCourseGoals(cfg.courseGoals ?? []);
      setTheoreticalFramework(cfg.theoreticalFramework ?? '');
      setExpressionStyle(cfg.expressionStyle ?? '');
      setRiskLevel(cfg.riskLevel ?? '');
      setLinkedRiskLevel(cfg.linkedRiskLevel ?? '');
      setLinkedChiefComplaint(cfg.linkedChiefComplaint ?? '');
      if (cfg.linkedRiskLevel || cfg.linkedChiefComplaint) {
        setCaseExpanded(true);
      }
    }
    setSynced(true);
  }

  const resolvedSessionCount = sessionCountPreset === 0
    ? (parseInt(customSessionCount, 10) || 0)
    : sessionCountPreset;

  function toggleGoal(goal: string) {
    setCourseGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal],
    );
  }

  async function handleSubmit() {
    setError('');
    if (!title.trim()) {
      setTitleTouched(true);
      setError('请输入课程项目名称');
      return;
    }

    const requirements: RequirementsConfig = {
      targetAudience: targetAudience || undefined,
      problemTopic: problemTopic || undefined,
      problemStage: problemStage || undefined,
      deliveryFormat: deliveryFormat || undefined,
      sessionCount: resolvedSessionCount || undefined,
      sessionDuration: sessionDuration || undefined,
      courseGoals: courseGoals.length > 0 ? courseGoals : undefined,
      theoreticalFramework: theoreticalFramework || undefined,
      expressionStyle: expressionStyle || undefined,
      riskLevel: riskLevel || undefined,
      linkedRiskLevel: linkedRiskLevel || undefined,
      linkedChiefComplaint: linkedChiefComplaint || undefined,
    };

    setIsSubmitting(true);

    try {
      // Step 1: Create or update course with requirements
      let activeCourseId = courseId;

      if (!isEditing) {
        const created = await createCourse.mutateAsync({
          title: title.trim(),
          status: 'draft' as const,
          requirementsConfig: requirements,
        });
        activeCourseId = created.id;
      } else {
        await updateCourse.mutateAsync({
          courseId: courseId!,
          title: title.trim(),
          requirementsConfig: requirements,
        });
      }

      // Step 2: Generate blueprint via AI
      const blueprintData = await generateBlueprint.mutateAsync({
        requirements,
      });

      // Step 3: Save blueprint data and advance status
      await updateCourse.mutateAsync({
        courseId: activeCourseId!,
        blueprintData,
        status: 'blueprint' as const,
      });

      // Step 4: Navigate to blueprint page
      navigate(`/courses/${activeCourseId}/blueprint`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '生成蓝图失败，请重试';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back link */}
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-flex items-center gap-1"
      >
        &larr; 返回
      </button>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-8">
        {/* Page header */}
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {isEditing ? '编辑课程需求' : '新建课程项目'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            配置课程维度后，AI 将自动生成课程蓝图
          </p>
        </div>

        {/* Title input */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            课程项目名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
            placeholder="例如：家长厌学应对系列课"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${
              titleTouched && !title.trim() ? 'border-red-300' : 'border-slate-200'
            }`}
          />
        </div>

        {/* ─── Section: 基础维度 ─── */}
        <SectionHeader title="基础维度" />

        {/* 服务对象 */}
        <FieldGroup label="服务对象">
          <RadioGroup
            options={TARGET_AUDIENCE_OPTIONS}
            value={targetAudience}
            onChange={setTargetAudience}
          />
        </FieldGroup>

        {/* 问题主题 */}
        <FieldGroup label="问题主题">
          <SelectDropdown
            options={PROBLEM_TOPIC_OPTIONS}
            value={problemTopic}
            onChange={setProblemTopic}
            placeholder="选择问题主题"
          />
        </FieldGroup>

        {/* 问题阶段 */}
        <FieldGroup label="问题阶段">
          <SelectDropdown
            options={PROBLEM_STAGE_OPTIONS}
            value={problemStage}
            onChange={setProblemStage}
            placeholder="选择问题阶段"
          />
        </FieldGroup>

        {/* ─── Section: 课程形式 ─── */}
        <SectionHeader title="课程形式" />

        {/* 交付形式 */}
        <FieldGroup label="交付形式">
          <RadioGroup
            options={DELIVERY_FORMAT_OPTIONS}
            value={deliveryFormat}
            onChange={setDeliveryFormat}
          />
        </FieldGroup>

        {/* 课程节数 */}
        <FieldGroup label="课程节数">
          <div className="flex flex-wrap items-center gap-2">
            <SelectDropdown
              options={SESSION_COUNT_OPTIONS.map((o) => ({
                value: String(o.value),
                label: o.label,
              }))}
              value={String(sessionCountPreset)}
              onChange={(v) => setSessionCountPreset(Number(v))}
              placeholder="选择节数"
            />
            {sessionCountPreset === 0 && (
              <input
                type="number"
                min={1}
                max={50}
                value={customSessionCount}
                onChange={(e) => setCustomSessionCount(e.target.value)}
                placeholder="输入节数"
                className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}
          </div>
        </FieldGroup>

        {/* 每节时长 */}
        <FieldGroup label="每节时长">
          <SelectDropdown
            options={SESSION_DURATION_OPTIONS.map((o) => ({
              value: String(o.value),
              label: o.label,
            }))}
            value={String(sessionDuration)}
            onChange={(v) => setSessionDuration(Number(v))}
            placeholder="选择时长"
          />
        </FieldGroup>

        {/* ─── Section: 内容设定 ─── */}
        <SectionHeader title="内容设定" />

        {/* 课程目标 */}
        <FieldGroup label="课程目标">
          <div className="flex flex-wrap gap-3">
            {COURSE_GOALS_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={courseGoals.includes(opt.value)}
                  onChange={() => toggleGoal(opt.value)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </FieldGroup>

        {/* 理论框架 */}
        <FieldGroup label="理论框架">
          <SelectDropdown
            options={THEORETICAL_FRAMEWORK_OPTIONS}
            value={theoreticalFramework}
            onChange={setTheoreticalFramework}
            placeholder="选择理论框架"
          />
        </FieldGroup>

        {/* 表达风格 */}
        <FieldGroup label="表达风格">
          <RadioGroup
            options={EXPRESSION_STYLE_OPTIONS}
            value={expressionStyle}
            onChange={setExpressionStyle}
          />
        </FieldGroup>

        {/* 风险等级 */}
        <FieldGroup label="风险等级">
          <RadioGroup
            options={RISK_LEVEL_OPTIONS}
            value={riskLevel}
            onChange={setRiskLevel}
          />
        </FieldGroup>

        {/* ─── Section: 关联来访者 (collapsible) ─── */}
        <div className="border-t border-slate-100 pt-6">
          <button
            type="button"
            onClick={() => setCaseExpanded(!caseExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            <span className={`transition-transform ${caseExpanded ? 'rotate-90' : ''}`}>
              &#9654;
            </span>
            关联来访者信息
            <span className="text-xs text-slate-400 font-normal">（可选）</span>
          </button>

          {caseExpanded && (
            <div className="mt-4 space-y-4 pl-4 border-l-2 border-slate-100">
              <p className="text-xs text-slate-400">
                可选：关联来访者信息，帮助 AI 更精准地定制课程内容
              </p>

              <FieldGroup label="来访者风险等级">
                <input
                  type="text"
                  value={linkedRiskLevel}
                  onChange={(e) => setLinkedRiskLevel(e.target.value)}
                  placeholder="例如：中风险"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </FieldGroup>

              <FieldGroup label="主诉">
                <textarea
                  value={linkedChiefComplaint}
                  onChange={(e) => setLinkedChiefComplaint(e.target.value)}
                  placeholder="简要描述来访者的主诉信息"
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </FieldGroup>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="pt-2">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full px-6 py-3 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting && <Spinner />}
            {isSubmitting ? 'AI 正在生成课程蓝图...' : '生成课程蓝图'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Sub-components ─────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-t border-slate-100 pt-6">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-2">{label}</label>
      {children}
    </div>
  );
}

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-sm border transition ${
            value === opt.value
              ? 'border-brand-600 bg-brand-50 text-brand-700 font-medium'
              : 'border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SelectDropdown({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

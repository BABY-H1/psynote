import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Edit3, Trash2, Save, Sparkles, Send, Loader2, Plus, X,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { useScale, useUpdateScale, useDeleteScale } from '../../../api/useScales';
import { useCreateScaleChat } from '../../../api/useAI';
import { PageLoading, useToast } from '../../../shared/components';

const RISK_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '无风险等级' },
  { value: 'level_1', label: '一级（一般）' },
  { value: 'level_2', label: '二级（关注）' },
  { value: 'level_3', label: '三级（严重）' },
  { value: 'level_4', label: '四级（危机）' },
];

const SCORING_MODE_LABELS: Record<string, string> = {
  sum: '总分求和',
  average: '平均分',
};

type SubTab = 'overview' | 'dimensions' | 'items' | 'options';

interface RuleEdit {
  minScore: number;
  maxScore: number;
  label: string;
  description: string;
  advice: string;
  riskLevel: string;
}

interface DimensionEdit {
  name: string;
  description: string;
  calculationMethod: string;
  rules: RuleEdit[];
}

interface ItemEdit {
  text: string;
  dimensionIndex: number;
  isReverseScored: boolean;
}

interface OptionEdit {
  label: string;
  value: number;
}

interface EditState {
  title: string;
  description: string;
  instructions: string;
  scoringMode: string;
  isPublic: boolean;
  dimensions: DimensionEdit[];
  items: ItemEdit[];
  // Shared options across all items
  options: OptionEdit[];
}

function scaleToEditState(scale: any): EditState {
  const dimensions: DimensionEdit[] = (scale.dimensions || []).map((d: any) => ({
    name: d.name || '',
    description: d.description || '',
    calculationMethod: d.calculationMethod || 'sum',
    rules: (d.rules || []).map((r: any) => ({
      minScore: Number(r.minScore) || 0,
      maxScore: Number(r.maxScore) || 0,
      label: r.label || '',
      description: r.description || '',
      advice: r.advice || '',
      riskLevel: r.riskLevel || '',
    })),
  }));

  const items: ItemEdit[] = (scale.items || []).map((it: any) => {
    const dimIdx = (scale.dimensions || []).findIndex((d: any) => d.id === it.dimensionId);
    return {
      text: it.text || '',
      dimensionIndex: dimIdx >= 0 ? dimIdx : 0,
      isReverseScored: !!it.isReverseScored,
    };
  });

  // Determine shared options: use first item's options if available
  const firstItemOptions = (scale.items || [])[0]?.options as
    | { label: string; value: number }[]
    | undefined;
  const options: OptionEdit[] = (firstItemOptions || []).map((o) => ({
    label: o.label || '',
    value: Number(o.value) || 0,
  }));

  return {
    title: scale.title || '',
    description: scale.description || '',
    instructions: scale.instructions || '',
    scoringMode: scale.scoringMode || 'sum',
    isPublic: !!scale.isPublic,
    dimensions,
    items,
    options,
  };
}

interface Props {
  scaleId: string;
  onBack: () => void;
  initialEditing?: boolean;
  onPreviewReport?: () => void;
}

export function ScaleDetail({ scaleId, onBack, initialEditing = false, onPreviewReport }: Props) {
  const { data: scale, isLoading } = useScale(scaleId);
  const updateScale = useUpdateScale();
  const deleteScale = useDeleteScale();
  const { toast } = useToast();

  const [editing, setEditing] = useState(initialEditing);
  const [editData, setEditData] = useState<EditState | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('overview');
  // Track which dimension groups are expanded in the items tab
  const [expandedDimGroups, setExpandedDimGroups] = useState<Set<number>>(new Set([0]));

  useEffect(() => {
    if (initialEditing && scale && !editData) {
      setEditData(scaleToEditState(scale));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditing, scale]);

  const handleEdit = useCallback(() => {
    if (!scale) return;
    setEditData(scaleToEditState(scale));
    setEditing(true);
  }, [scale]);

  const handleCancel = () => {
    setEditing(false);
    setEditData(null);
  };

  const handleSave = async () => {
    if (!editData || !scale) {
      toast('没有可保存的修改', 'error');
      return;
    }
    try {
      // Convert each item's shared options into per-item options array
      const sharedOptions = editData.options.length > 0
        ? editData.options
        : [{ label: '', value: 0 }];

      await updateScale.mutateAsync({
        scaleId,
        title: editData.title,
        description: editData.description,
        instructions: editData.instructions,
        scoringMode: editData.scoringMode,
        isPublic: editData.isPublic,
        dimensions: editData.dimensions.map((d, i) => ({
          name: d.name,
          description: d.description || undefined,
          calculationMethod: d.calculationMethod,
          sortOrder: i,
          rules: d.rules.length > 0
            ? d.rules.map((r) => ({
                minScore: r.minScore,
                maxScore: r.maxScore,
                label: r.label,
                description: r.description || undefined,
                advice: r.advice || undefined,
                riskLevel: r.riskLevel || undefined,
              }))
            : undefined,
        })),
        items: editData.items.map((it, i) => ({
          text: it.text,
          dimensionIndex: it.dimensionIndex,
          isReverseScored: it.isReverseScored,
          options: sharedOptions,
          sortOrder: i,
        })),
      });
      toast('量表已保存', 'success');
      setEditing(false);
      setEditData(null);
    } catch (err) {
      console.error('保存量表失败:', err);
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    }
  };

  const handleDelete = async () => {
    if (!scale) return;
    if (!confirm(`确定删除"${scale.title}"？此操作不可恢复。`)) return;
    try {
      await deleteScale.mutateAsync(scaleId);
      toast('量表已删除', 'success');
      onBack();
    } catch {
      toast('删除失败', 'error');
    }
  };

  // ─── Field updaters ────────────────────────────────────────────

  const updateField = useCallback(<K extends keyof EditState>(key: K, value: EditState[K]) => {
    setEditData((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const updateDimension = useCallback(
    (idx: number, patch: Partial<DimensionEdit>) => {
      setEditData((prev) => {
        if (!prev) return prev;
        const dimensions = [...prev.dimensions];
        dimensions[idx] = { ...dimensions[idx], ...patch };
        return { ...prev, dimensions };
      });
    },
    [],
  );

  const addDimension = useCallback(() => {
    setEditData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        dimensions: [
          ...prev.dimensions,
          { name: '', description: '', calculationMethod: 'sum', rules: [] },
        ],
      };
    });
  }, []);

  const removeDimension = useCallback((idx: number) => {
    setEditData((prev) => {
      if (!prev) return prev;
      // Remove the dimension and remap items pointing at higher indices
      const dimensions = prev.dimensions.filter((_, i) => i !== idx);
      const items = prev.items
        .filter((it) => it.dimensionIndex !== idx)
        .map((it) => ({
          ...it,
          dimensionIndex: it.dimensionIndex > idx ? it.dimensionIndex - 1 : it.dimensionIndex,
        }));
      return { ...prev, dimensions, items };
    });
  }, []);

  const updateRule = useCallback(
    (dimIdx: number, ruleIdx: number, patch: Partial<RuleEdit>) => {
      setEditData((prev) => {
        if (!prev) return prev;
        const dimensions = [...prev.dimensions];
        const rules = [...dimensions[dimIdx].rules];
        rules[ruleIdx] = { ...rules[ruleIdx], ...patch };
        dimensions[dimIdx] = { ...dimensions[dimIdx], rules };
        return { ...prev, dimensions };
      });
    },
    [],
  );

  const addRule = useCallback((dimIdx: number) => {
    setEditData((prev) => {
      if (!prev) return prev;
      const dimensions = [...prev.dimensions];
      dimensions[dimIdx] = {
        ...dimensions[dimIdx],
        rules: [
          ...dimensions[dimIdx].rules,
          { minScore: 0, maxScore: 0, label: '', description: '', advice: '', riskLevel: '' },
        ],
      };
      return { ...prev, dimensions };
    });
  }, []);

  const removeRule = useCallback((dimIdx: number, ruleIdx: number) => {
    setEditData((prev) => {
      if (!prev) return prev;
      const dimensions = [...prev.dimensions];
      dimensions[dimIdx] = {
        ...dimensions[dimIdx],
        rules: dimensions[dimIdx].rules.filter((_, i) => i !== ruleIdx),
      };
      return { ...prev, dimensions };
    });
  }, []);

  const updateItem = useCallback((idx: number, patch: Partial<ItemEdit>) => {
    setEditData((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = { ...items[idx], ...patch };
      return { ...prev, items };
    });
  }, []);

  const addItem = useCallback((dimensionIndex = 0) => {
    setEditData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: [
          ...prev.items,
          { text: '', dimensionIndex, isReverseScored: false },
        ],
      };
    });
  }, []);

  const removeItem = useCallback((idx: number) => {
    setEditData((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.filter((_, i) => i !== idx) };
    });
  }, []);

  const updateOption = useCallback((idx: number, patch: Partial<OptionEdit>) => {
    setEditData((prev) => {
      if (!prev) return prev;
      const options = [...prev.options];
      options[idx] = { ...options[idx], ...patch };
      return { ...prev, options };
    });
  }, []);

  const addOption = useCallback(() => {
    setEditData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        options: [...prev.options, { label: '', value: prev.options.length }],
      };
    });
  }, []);

  const removeOption = useCallback((idx: number) => {
    setEditData((prev) => {
      if (!prev) return prev;
      return { ...prev, options: prev.options.filter((_, i) => i !== idx) };
    });
  }, []);

  // AI: apply a full new scale state from the chat assistant
  const applyAIChange = useCallback(
    (newState: Partial<EditState>) => {
      setEditData((prev) => {
        if (!prev) return prev;
        return { ...prev, ...newState };
      });
      toast('AI 已更新量表', 'success');
    },
    [toast],
  );

  if (isLoading || !scale) return <PageLoading text="加载量表详情..." />;

  const data: EditState = editing && editData ? editData : scaleToEditState(scale);

  return (
    <div className="flex -m-6" style={{ height: 'calc(100vh - 5rem)' }}>
      {/* LEFT: Tabbed content */}
      <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
        {/* Top bar with sub-tabs + actions */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
          {/* Sub-tab bar */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {(
              [
                { key: 'overview', label: '总览' },
                { key: 'dimensions', label: '维度' },
                { key: 'items', label: '题目' },
                { key: 'options', label: '选项配置' },
              ] as { key: SubTab; label: string }[]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveSubTab(t.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  activeSubTab === t.key
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateScale.isPending || !editData}
                  className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {updateScale.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" /> 保存
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                  {SCORING_MODE_LABELS[data.scoringMode] || data.scoringMode}
                </span>
                <button
                  onClick={handleEdit}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" /> 编辑
                </button>
                {onPreviewReport && (
                  <button
                    onClick={onPreviewReport}
                    className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50"
                  >
                    预览报告
                  </button>
                )}
                {scale.orgId && (
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 删除
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-6">
            {activeSubTab === 'overview' && (
              <OverviewTab
                editing={editing}
                title={data.title}
                description={data.description}
                instructions={data.instructions}
                scoringMode={data.scoringMode}
                isPublic={data.isPublic}
                onTitleChange={(v) => updateField('title', v)}
                onDescriptionChange={(v) => updateField('description', v)}
                onInstructionsChange={(v) => updateField('instructions', v)}
                onScoringModeChange={(v) => updateField('scoringMode', v)}
                onIsPublicChange={(v) => updateField('isPublic', v)}
              />
            )}
            {activeSubTab === 'dimensions' && (
              <DimensionsTab
                editing={editing}
                dimensions={data.dimensions}
                onUpdate={updateDimension}
                onAdd={addDimension}
                onRemove={removeDimension}
                onAddRule={addRule}
                onUpdateRule={updateRule}
                onRemoveRule={removeRule}
              />
            )}
            {activeSubTab === 'items' && (
              <ItemsTab
                editing={editing}
                items={data.items}
                dimensions={data.dimensions}
                expandedDimGroups={expandedDimGroups}
                onToggleGroup={(idx) =>
                  setExpandedDimGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(idx)) next.delete(idx);
                    else next.add(idx);
                    return next;
                  })
                }
                onUpdateItem={updateItem}
                onAddItem={addItem}
                onRemoveItem={removeItem}
              />
            )}
            {activeSubTab === 'options' && (
              <OptionsTab
                editing={editing}
                options={data.options}
                onUpdate={updateOption}
                onAdd={addOption}
                onRemove={removeOption}
              />
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: AI Chat panel */}
      <div className="w-[420px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-slate-900 truncate">{data.title || '量表详情'}</h3>
        </div>

        <ScaleAIChatPanel
          editing={editing}
          currentState={data}
          onApply={applyAIChange}
        />
      </div>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────

function OverviewTab({
  editing,
  title,
  description,
  instructions,
  scoringMode,
  isPublic,
  onTitleChange,
  onDescriptionChange,
  onInstructionsChange,
  onScoringModeChange,
  onIsPublicChange,
}: {
  editing: boolean;
  title: string;
  description: string;
  instructions: string;
  scoringMode: string;
  isPublic: boolean;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onInstructionsChange: (v: string) => void;
  onScoringModeChange: (v: string) => void;
  onIsPublicChange: (v: boolean) => void;
}) {
  return (
    <CardSection title="量表基本信息">
      <Field label="量表名称" required>
        {editing ? (
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        ) : (
          <p className="text-sm text-slate-700">{title || <span className="text-slate-300 italic">未填写</span>}</p>
        )}
      </Field>

      <Field label="描述">
        {editing ? (
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
          />
        ) : description ? (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{description}</p>
        ) : (
          <p className="text-xs text-slate-300 italic">未填写</p>
        )}
      </Field>

      <Field label="作答指导语">
        {editing ? (
          <textarea
            value={instructions}
            onChange={(e) => onInstructionsChange(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
          />
        ) : instructions ? (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{instructions}</p>
        ) : (
          <p className="text-xs text-slate-300 italic">未填写</p>
        )}
      </Field>

      <Field label="计分模式">
        {editing ? (
          <select
            value={scoringMode}
            onChange={(e) => onScoringModeChange(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="sum">总分求和</option>
            <option value="average">平均分</option>
          </select>
        ) : (
          <p className="text-sm text-slate-700">{SCORING_MODE_LABELS[scoringMode] || scoringMode}</p>
        )}
      </Field>

      <Field label="可见范围">
        {editing ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => onIsPublicChange(e.target.checked)}
              className="rounded border-slate-300"
            />
            公开此量表（其他机构也可使用）
          </label>
        ) : (
          <p className="text-sm text-slate-700">{isPublic ? '公开' : '仅本机构'}</p>
        )}
      </Field>
    </CardSection>
  );
}

// ─── Dimensions Tab ──────────────────────────────────────────

function DimensionsTab({
  editing,
  dimensions,
  onUpdate,
  onAdd,
  onRemove,
  onAddRule,
  onUpdateRule,
  onRemoveRule,
}: {
  editing: boolean;
  dimensions: DimensionEdit[];
  onUpdate: (idx: number, patch: Partial<DimensionEdit>) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onAddRule: (dimIdx: number) => void;
  onUpdateRule: (dimIdx: number, ruleIdx: number, patch: Partial<RuleEdit>) => void;
  onRemoveRule: (dimIdx: number, ruleIdx: number) => void;
}) {
  return (
    <div className="space-y-3">
      {dimensions.length === 0 && !editing && (
        <p className="text-center text-sm text-slate-400 py-8">暂无维度</p>
      )}

      {dimensions.map((dim, di) => (
        <div key={di} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full font-bold">
              维度 {di + 1}
            </span>
            {editing ? (
              <input
                value={dim.name}
                onChange={(e) => onUpdate(di, { name: e.target.value })}
                placeholder="维度名称"
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            ) : (
              <span className="flex-1 text-sm font-semibold text-slate-900">{dim.name || '未命名'}</span>
            )}
            {editing && (
              <button
                onClick={() => onRemove(di)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                title="删除维度"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="p-4 space-y-3">
            <Field label="维度描述">
              {editing ? (
                <textarea
                  value={dim.description}
                  onChange={(e) => onUpdate(di, { description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                />
              ) : dim.description ? (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{dim.description}</p>
              ) : (
                <p className="text-xs text-slate-300 italic">未填写</p>
              )}
            </Field>

            <Field label="该维度计分方式">
              {editing ? (
                <select
                  value={dim.calculationMethod}
                  onChange={(e) => onUpdate(di, { calculationMethod: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="sum">求和</option>
                  <option value="average">平均</option>
                </select>
              ) : (
                <p className="text-sm text-slate-700">{dim.calculationMethod === 'sum' ? '求和' : '平均'}</p>
              )}
            </Field>

            {/* Rules */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 font-semibold">解读规则</span>
                {editing && (
                  <button
                    onClick={() => onAddRule(di)}
                    className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> 添加规则
                  </button>
                )}
              </div>
              {dim.rules.length === 0 && (
                <p className="text-xs text-slate-300 italic">暂无规则</p>
              )}
              <div className="space-y-2">
                {dim.rules.map((rule, ri) => (
                  <RuleRow
                    key={ri}
                    rule={rule}
                    editing={editing}
                    onUpdate={(patch) => onUpdateRule(di, ri, patch)}
                    onRemove={() => onRemoveRule(di, ri)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}

      {editing && (
        <button
          onClick={onAdd}
          className="w-full py-3 border border-dashed border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-600 rounded-xl text-sm flex items-center justify-center gap-1"
        >
          <Plus className="w-4 h-4" /> 添加维度
        </button>
      )}
    </div>
  );
}

function RuleRow({
  rule,
  editing,
  onUpdate,
  onRemove,
}: {
  rule: RuleEdit;
  editing: boolean;
  onUpdate: (patch: Partial<RuleEdit>) => void;
  onRemove: () => void;
}) {
  if (!editing) {
    return (
      <div className="bg-slate-50 rounded-lg p-3 space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-xs text-slate-500">
            {rule.minScore} ~ {rule.maxScore} 分
          </span>
          {rule.riskLevel && (
            <span className="text-xs px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">
              {RISK_OPTIONS.find((r) => r.value === rule.riskLevel)?.label || rule.riskLevel}
            </span>
          )}
          <span className="font-medium text-slate-800">{rule.label}</span>
        </div>
        {rule.description && (
          <p className="text-xs text-slate-500">说明: {rule.description}</p>
        )}
        {rule.advice && (
          <p className="text-xs text-slate-500">建议: {rule.advice}</p>
        )}
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          value={rule.minScore || ''}
          onChange={(e) => onUpdate({ minScore: Number(e.target.value) })}
          placeholder="最低分"
          className="w-20 px-2 py-1 border border-slate-200 rounded text-xs"
        />
        <span className="text-xs text-slate-400">~</span>
        <input
          type="number"
          value={rule.maxScore || ''}
          onChange={(e) => onUpdate({ maxScore: Number(e.target.value) })}
          placeholder="最高分"
          className="w-20 px-2 py-1 border border-slate-200 rounded text-xs"
        />
        <input
          value={rule.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="等级标签"
          className="w-28 px-2 py-1 border border-slate-200 rounded text-xs"
        />
        <select
          value={rule.riskLevel}
          onChange={(e) => onUpdate({ riskLevel: e.target.value })}
          className="px-2 py-1 border border-slate-200 rounded text-xs"
        >
          {RISK_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          onClick={onRemove}
          className="ml-auto text-slate-300 hover:text-red-500"
          title="移除规则"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={rule.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="规则说明（可选）"
          className="px-2 py-1 border border-slate-100 rounded text-xs text-slate-600"
        />
        <input
          value={rule.advice}
          onChange={(e) => onUpdate({ advice: e.target.value })}
          placeholder="建议文本（可选）"
          className="px-2 py-1 border border-slate-100 rounded text-xs text-slate-600"
        />
      </div>
    </div>
  );
}

// ─── Items Tab ───────────────────────────────────────────────

function ItemsTab({
  editing,
  items,
  dimensions,
  expandedDimGroups,
  onToggleGroup,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
}: {
  editing: boolean;
  items: ItemEdit[];
  dimensions: DimensionEdit[];
  expandedDimGroups: Set<number>;
  onToggleGroup: (dimIdx: number) => void;
  onUpdateItem: (idx: number, patch: Partial<ItemEdit>) => void;
  onAddItem: (dimensionIndex: number) => void;
  onRemoveItem: (idx: number) => void;
}) {
  // Group items by dimension index, but also keep their original index
  const grouped = useMemo(() => {
    const map: Record<number, { item: ItemEdit; originalIndex: number }[]> = {};
    items.forEach((item, originalIndex) => {
      const di = item.dimensionIndex;
      if (!map[di]) map[di] = [];
      map[di].push({ item, originalIndex });
    });
    return map;
  }, [items]);

  if (dimensions.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        请先在「维度」tab 中创建至少一个维度，然后再添加题目。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {dimensions.map((dim, di) => {
        const dimItems = grouped[di] || [];
        const isExpanded = expandedDimGroups.has(di);
        return (
          <div key={di} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => onToggleGroup(di)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
                <span className="text-sm font-semibold text-slate-700">
                  {dim.name || `维度 ${di + 1}`}
                </span>
                <span className="text-xs text-slate-400">({dimItems.length} 题)</span>
              </div>
              {editing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddItem(di);
                    if (!isExpanded) onToggleGroup(di);
                  }}
                  className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> 添加题目
                </button>
              )}
            </button>

            {isExpanded && (
              <div className="border-t border-slate-100 divide-y divide-slate-100">
                {dimItems.length === 0 ? (
                  <p className="text-xs text-slate-300 italic px-4 py-3">该维度暂无题目</p>
                ) : (
                  dimItems.map(({ item, originalIndex }, displayIdx) => (
                    <ItemRow
                      key={originalIndex}
                      number={displayIdx + 1}
                      item={item}
                      dimensions={dimensions}
                      editing={editing}
                      onUpdate={(patch) => onUpdateItem(originalIndex, patch)}
                      onRemove={() => onRemoveItem(originalIndex)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ItemRow({
  number,
  item,
  dimensions,
  editing,
  onUpdate,
  onRemove,
}: {
  number: number;
  item: ItemEdit;
  dimensions: DimensionEdit[];
  editing: boolean;
  onUpdate: (patch: Partial<ItemEdit>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="text-xs text-slate-400 mt-2 w-6 text-right shrink-0">{number}.</span>
        <div className="flex-1 space-y-2">
          {editing ? (
            <input
              value={item.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              placeholder="题目文本"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          ) : (
            <p className="text-sm text-slate-700">{item.text || <span className="text-slate-300 italic">未填写</span>}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {editing ? (
              <>
                <select
                  value={item.dimensionIndex}
                  onChange={(e) => onUpdate({ dimensionIndex: Number(e.target.value) })}
                  className="px-2 py-1 border border-slate-200 rounded text-xs"
                >
                  {dimensions.map((d, di) => (
                    <option key={di} value={di}>
                      {d.name || `维度 ${di + 1}`}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={item.isReverseScored}
                    onChange={(e) => onUpdate({ isReverseScored: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  反向计分
                </label>
              </>
            ) : (
              item.isReverseScored && (
                <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                  反向计分
                </span>
              )
            )}
          </div>
        </div>
        {editing && (
          <button
            onClick={onRemove}
            className="text-slate-300 hover:text-red-500 mt-2"
            title="删除题目"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Options Tab ─────────────────────────────────────────────

function OptionsTab({
  editing,
  options,
  onUpdate,
  onAdd,
  onRemove,
}: {
  editing: boolean;
  options: OptionEdit[];
  onUpdate: (idx: number, patch: Partial<OptionEdit>) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <CardSection title="共享选项配置">
      <p className="text-xs text-slate-400 mb-3">
        所有题目共享同一组答题选项（如 5 点李克特量表的「非常不同意 → 非常同意」）。保存时会自动应用到每一道题。
      </p>

      {options.length === 0 && !editing && (
        <p className="text-sm text-slate-400 italic">未配置选项</p>
      )}

      <div className="space-y-2">
        {options.map((opt, oi) => (
          <div key={oi} className="flex items-center gap-2">
            <span className="text-xs text-slate-400 w-6 text-right">{oi + 1}.</span>
            {editing ? (
              <>
                <input
                  value={opt.label}
                  onChange={(e) => onUpdate(oi, { label: e.target.value })}
                  placeholder="选项文字"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <input
                  type="number"
                  value={opt.value}
                  onChange={(e) => onUpdate(oi, { value: Number(e.target.value) })}
                  placeholder="分值"
                  className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <button
                  onClick={() => onRemove(oi)}
                  className="text-slate-300 hover:text-red-500"
                  title="移除选项"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-slate-700">{opt.label}</span>
                <span className="text-xs font-mono text-slate-500">{opt.value} 分</span>
              </>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <button
          onClick={onAdd}
          className="mt-3 text-xs text-brand-600 hover:text-brand-700 flex items-center gap-0.5"
        >
          <Plus className="w-3 h-3" /> 添加选项
        </button>
      )}
    </CardSection>
  );
}

// ─── Card Section ────────────────────────────────────────────

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400 font-medium block mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─── AI Chat Panel ───────────────────────────────────────────

type ChatMsg = { role: 'user' | 'assistant'; content: string };

function ScaleAIChatPanel({
  editing,
  currentState,
  onApply,
}: {
  editing: boolean;
  currentState: EditState;
  onApply: (newState: Partial<EditState>) => void;
}) {
  const chatMutation = useCreateScaleChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        '我可以帮你修改和完善量表。\n\n比如你可以说：\n• "增加一个关于焦虑症状的维度"\n• "把第 3 题改为反向计分"\n• "添加一条 15-20 分对应中度的解读规则"',
    },
  ]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!editing) return;
    const text = input.trim();
    if (!text || chatMutation.isPending) return;
    setInput('');

    const userMsg: ChatMsg = { role: 'user', content: text };
    setMessages((p) => [...p, userMsg]);

    // Send the current scale state as context, then the conversation
    const contextMsg = {
      role: 'user' as const,
      content: `当前量表的完整结构如下，请基于这个结构进行修改：\n\n${JSON.stringify(
        {
          title: currentState.title,
          description: currentState.description,
          instructions: currentState.instructions,
          scoringMode: currentState.scoringMode,
          dimensions: currentState.dimensions.map((d) => ({
            name: d.name,
            description: d.description,
            calculationMethod: d.calculationMethod,
            rules: d.rules,
          })),
          items: currentState.items.map((it) => ({
            text: it.text,
            dimensionIndex: it.dimensionIndex,
            isReverseScored: it.isReverseScored,
          })),
          options: currentState.options,
        },
        null,
        2,
      )}`,
    };

    const apiMessages = [contextMsg, ...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    chatMutation.mutate(
      { messages: apiMessages },
      {
        onSuccess: (data) => {
          if (data.type === 'scale') {
            const s = data.scale;
            // Apply the AI's revised scale to editData
            onApply({
              title: s.title || currentState.title,
              description: s.description || currentState.description,
              instructions: s.instructions || currentState.instructions,
              scoringMode: s.scoringMode || currentState.scoringMode,
              options: s.options.map((o) => ({ label: o.label, value: o.value })),
              dimensions: s.dimensions.map((d) => ({
                name: d.name,
                description: d.description || '',
                calculationMethod: d.calculationMethod || 'sum',
                rules: (d.rules || []).map((r) => ({
                  minScore: Number(r.minScore) || 0,
                  maxScore: Number(r.maxScore) || 0,
                  label: r.label,
                  description: r.description || '',
                  advice: r.advice || '',
                  riskLevel: r.riskLevel || '',
                })),
              })),
              items: s.items.map((it) => ({
                text: it.text,
                dimensionIndex: it.dimensionIndex ?? 0,
                isReverseScored: it.isReverseScored,
              })),
            });
            setMessages((p) => [
              ...p,
              { role: 'assistant', content: data.summary || '已根据你的描述更新量表，左侧已刷新。' },
            ]);
          } else {
            setMessages((p) => [...p, { role: 'assistant', content: data.content }]);
          }
        },
        onError: (err) => {
          setMessages((p) => [
            ...p,
            {
              role: 'assistant',
              content: err instanceof Error ? `修改失败：${err.message}` : '修改失败，请重试',
            },
          ]);
        },
      },
    );
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-white">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-slate-900">AI 助手</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 relative">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[92%] rounded-2xl px-3.5 py-2 text-xs ${
                msg.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-md'
                  : 'bg-white text-slate-700 rounded-bl-md border border-slate-200'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-md px-3.5 py-2 text-xs text-slate-500 flex items-center gap-1.5 border border-slate-200">
              <Loader2 className="w-3 h-3 animate-spin" /> AI 思考中...
            </div>
          </div>
        )}

        {!editing && (
          <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 max-w-[85%] text-center shadow-sm">
              点击右上角「编辑」按钮，进入编辑态后即可与 AI 对话修改量表
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-200 bg-white">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())
            }
            placeholder={editing ? '输入修改意见...' : '请先点击编辑'}
            disabled={!editing || chatMutation.isPending}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!editing || chatMutation.isPending || !input.trim()}
            className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

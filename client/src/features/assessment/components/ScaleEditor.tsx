import React, { useState, useEffect } from 'react';
import { useScale, useCreateScale, useUpdateScale } from '../../../api/useScales';
import { PageLoading, useToast } from '../../../shared/components';

interface InitialData {
  title: string;
  description: string;
  instructions: string;
  scoringMode: 'sum' | 'average';
  options: { label: string; value: number }[];
  items: { text: string; isReverseScored: boolean; dimensionIndex: number | null }[];
  dimensions: {
    name: string;
    description: string;
    calculationMethod: 'sum' | 'average';
    rules: {
      minScore: number;
      maxScore: number;
      label: string;
      description: string;
      advice: string;
      riskLevel: string;
    }[];
  }[];
}

interface Props {
  scaleId?: string;
  initialData?: InitialData;
  onClose: () => void;
}

interface DimensionInput {
  name: string;
  description: string;
  calculationMethod: string;
  rules: {
    minScore: number;
    maxScore: number;
    label: string;
    description: string;
    advice: string;
    riskLevel: string;
  }[];
}

interface ItemInput {
  text: string;
  dimensionIndex: number;
  isReverseScored: boolean;
  options: { label: string; value: number }[];
}

export function ScaleEditor({ scaleId, initialData, onClose }: Props) {
  const { data: fetchedScale, isLoading } = useScale(scaleId);
  const createScale = useCreateScale();
  const updateScale = useUpdateScale();
  const { toast } = useToast();

  const isEdit = !!scaleId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [scoringMode, setScoringMode] = useState<string>('sum');
  const [dimensions, setDimensions] = useState<DimensionInput[]>([]);
  const [items, setItems] = useState<ItemInput[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Initialize form from fetched scale or initialData
  useEffect(() => {
    if (initialized) return;

    if (isEdit && fetchedScale) {
      setTitle(fetchedScale.title || '');
      setDescription(fetchedScale.description || '');
      setInstructions(fetchedScale.instructions || '');
      setScoringMode(fetchedScale.scoringMode || 'sum');
      setDimensions(
        fetchedScale.dimensions?.map((d) => ({
          name: d.name,
          description: d.description || '',
          calculationMethod: d.calculationMethod,
          rules: d.rules?.map((r) => ({
            minScore: Number(r.minScore),
            maxScore: Number(r.maxScore),
            label: r.label,
            description: r.description || '',
            advice: r.advice || '',
            riskLevel: r.riskLevel || '',
          })) || [],
        })) || [{ name: '', description: '', calculationMethod: 'sum', rules: [] }],
      );
      setItems(
        fetchedScale.items?.map((it) => ({
          text: it.text,
          dimensionIndex: fetchedScale.dimensions?.findIndex((d) => d.id === it.dimensionId) ?? 0,
          isReverseScored: it.isReverseScored,
          options: it.options as { label: string; value: number }[],
        })) || [{ text: '', dimensionIndex: 0, isReverseScored: false, options: [{ label: '', value: 0 }] }],
      );
      setInitialized(true);
    } else if (initialData) {
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      setInstructions(initialData.instructions || '');
      setScoringMode(initialData.scoringMode || 'sum');
      setDimensions(
        initialData.dimensions.map((d) => ({
          name: d.name,
          description: d.description || '',
          calculationMethod: d.calculationMethod,
          rules: d.rules || [],
        })),
      );
      setItems(
        initialData.items.map((it) => ({
          text: it.text,
          dimensionIndex: it.dimensionIndex ?? 0,
          isReverseScored: it.isReverseScored,
          options: initialData.options,
        })),
      );
      setInitialized(true);
    } else if (!isEdit) {
      setDimensions([{ name: '', description: '', calculationMethod: 'sum', rules: [] }]);
      setItems([{ text: '', dimensionIndex: 0, isReverseScored: false, options: [{ label: '', value: 0 }] }]);
      setInitialized(true);
    }
  }, [isEdit, fetchedScale, initialData, initialized]);

  if (isEdit && isLoading) {
    return <PageLoading text="加载量表数据..." />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isEdit) {
      await updateScale.mutateAsync({
        scaleId: scaleId!,
        title,
        description,
        instructions,
        scoringMode,
      });
      toast('量表已更新', 'success');
    } else {
      await createScale.mutateAsync({
        title,
        description,
        instructions,
        scoringMode,
        dimensions: dimensions.map((d, i) => ({
          name: d.name,
          description: d.description || undefined,
          calculationMethod: d.calculationMethod,
          sortOrder: i,
          rules: d.rules.length > 0 ? d.rules : undefined,
        })),
        items: items.map((it, i) => ({
          text: it.text,
          dimensionIndex: it.dimensionIndex,
          isReverseScored: it.isReverseScored,
          options: it.options,
          sortOrder: i,
        })),
      });
      toast('量表创建成功', 'success');
    }
    onClose();
  };

  const addDimension = () => {
    setDimensions([...dimensions, { name: '', description: '', calculationMethod: 'sum', rules: [] }]);
  };

  const addItem = () => {
    const defaultOptions = items[0]?.options || [{ label: '', value: 0 }];
    setItems([...items, { text: '', dimensionIndex: 0, isReverseScored: false, options: [...defaultOptions] }]);
  };

  const addOption = (itemIdx: number) => {
    const updated = [...items];
    updated[itemIdx].options.push({ label: '', value: updated[itemIdx].options.length });
    setItems(updated);
  };

  const addRule = (dimIdx: number) => {
    const updated = [...dimensions];
    updated[dimIdx].rules.push({ minScore: 0, maxScore: 0, label: '', description: '', advice: '', riskLevel: '' });
    setDimensions(updated);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-900">
          {isEdit ? '编辑量表' : initialData ? '编辑并保存量表' : '新建量表'}
        </h2>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-sm">返回</button>
      </div>

      {isEdit && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
          当前仅支持编辑元数据（名称、描述、指导语、计分方式）。维度和题目展示为只读，后续将支持在线编辑。
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic info */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="font-semibold text-slate-900">基本信息</h3>
          <input placeholder="量表名称" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <textarea placeholder="描述（可选）" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <textarea placeholder="作答指导语（可选）" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <select value={scoringMode} onChange={(e) => setScoringMode(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="sum">总分求和</option>
            <option value="average">平均分</option>
          </select>
        </section>

        {/* Dimensions */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">维度</h3>
            {!isEdit && (
              <button type="button" onClick={addDimension} className="text-sm text-brand-600 hover:underline">+ 添加维度</button>
            )}
          </div>
          {dimensions.map((dim, di) => (
            <div key={di} className="border border-slate-100 rounded-lg p-4 space-y-3">
              <div className="flex gap-3">
                <input
                  placeholder={`维度 ${di + 1} 名称`}
                  value={dim.name}
                  onChange={(e) => { const u = [...dimensions]; u[di].name = e.target.value; setDimensions(u); }}
                  required
                  readOnly={isEdit}
                  className={`flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${isEdit ? 'bg-slate-50 text-slate-500' : ''}`}
                />
                {!isEdit && dimensions.length > 1 && (
                  <button type="button" onClick={() => setDimensions(dimensions.filter((_, i) => i !== di))} className="text-sm text-red-500 hover:text-red-700">删除</button>
                )}
              </div>
              <input
                placeholder="维度描述（可选）"
                value={dim.description}
                onChange={(e) => { const u = [...dimensions]; u[di].description = e.target.value; setDimensions(u); }}
                readOnly={isEdit}
                className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${isEdit ? 'bg-slate-50 text-slate-500' : ''}`}
              />
              {/* Rules */}
              <div className="mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">解读规则</span>
                  {!isEdit && (
                    <button type="button" onClick={() => addRule(di)} className="text-xs text-brand-600 hover:underline">+ 添加规则</button>
                  )}
                </div>
                {dim.rules.length === 0 && (
                  <p className="text-xs text-slate-400">暂无规则</p>
                )}
                {dim.rules.map((rule, ri) => (
                  <div key={ri} className="flex gap-2 items-center mb-2 flex-wrap">
                    <input type="number" placeholder="最低分" value={rule.minScore || ''} readOnly={isEdit}
                      onChange={(e) => { const u = [...dimensions]; u[di].rules[ri].minScore = Number(e.target.value); setDimensions(u); }}
                      className={`w-20 px-2 py-1 border border-slate-200 rounded text-xs ${isEdit ? 'bg-slate-50 text-slate-500' : ''}`} />
                    <span className="text-xs text-slate-400">~</span>
                    <input type="number" placeholder="最高分" value={rule.maxScore || ''} readOnly={isEdit}
                      onChange={(e) => { const u = [...dimensions]; u[di].rules[ri].maxScore = Number(e.target.value); setDimensions(u); }}
                      className={`w-20 px-2 py-1 border border-slate-200 rounded text-xs ${isEdit ? 'bg-slate-50 text-slate-500' : ''}`} />
                    <input placeholder="标签" value={rule.label} readOnly={isEdit}
                      onChange={(e) => { const u = [...dimensions]; u[di].rules[ri].label = e.target.value; setDimensions(u); }}
                      className={`w-24 px-2 py-1 border border-slate-200 rounded text-xs ${isEdit ? 'bg-slate-50 text-slate-500' : ''}`} />
                    <select value={rule.riskLevel} disabled={isEdit}
                      onChange={(e) => { const u = [...dimensions]; u[di].rules[ri].riskLevel = e.target.value; setDimensions(u); }}
                      className={`px-2 py-1 border border-slate-200 rounded text-xs ${isEdit ? 'bg-slate-50 text-slate-500' : ''}`}>
                      <option value="">无风险等级</option>
                      <option value="level_1">一级（一般）</option>
                      <option value="level_2">二级（关注）</option>
                      <option value="level_3">三级（严重）</option>
                      <option value="level_4">四级（危机）</option>
                    </select>
                    {!isEdit && (
                      <button type="button" onClick={() => { const u = [...dimensions]; u[di].rules = u[di].rules.filter((_, i) => i !== ri); setDimensions(u); }} className="text-xs text-red-400 hover:text-red-600">移除</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Items */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">题目 ({items.length})</h3>
            {!isEdit && (
              <button type="button" onClick={addItem} className="text-sm text-brand-600 hover:underline">+ 添加题目</button>
            )}
          </div>
          {items.map((item, ii) => (
            <div key={ii} className="border border-slate-100 rounded-lg p-4 space-y-3">
              <div className="flex gap-3 items-start">
                <span className="text-sm font-medium text-slate-400 mt-2">{ii + 1}.</span>
                <div className="flex-1 space-y-2">
                  <input placeholder="题目文本" value={item.text} readOnly={isEdit}
                    onChange={(e) => { const u = [...items]; u[ii].text = e.target.value; setItems(u); }}
                    required
                    className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${isEdit ? 'bg-slate-50 text-slate-500' : ''}`} />
                  <div className="flex gap-3 items-center">
                    <select value={item.dimensionIndex} disabled={isEdit}
                      onChange={(e) => { const u = [...items]; u[ii].dimensionIndex = Number(e.target.value); setItems(u); }}
                      className={`px-3 py-1 border border-slate-200 rounded text-xs ${isEdit ? 'bg-slate-50 text-slate-500' : ''}`}>
                      {dimensions.map((d, di) => (
                        <option key={di} value={di}>{d.name || `维度 ${di + 1}`}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input type="checkbox" checked={item.isReverseScored} disabled={isEdit}
                        onChange={(e) => { const u = [...items]; u[ii].isReverseScored = e.target.checked; setItems(u); }} />
                      反向计分
                    </label>
                  </div>
                  {/* Options */}
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400">选项</span>
                    {item.options.map((opt, oi) => (
                      <div key={oi} className="flex gap-2 items-center">
                        <input placeholder="选项文字" value={opt.label} readOnly={isEdit}
                          onChange={(e) => { const u = [...items]; u[ii].options[oi].label = e.target.value; setItems(u); }}
                          className={`flex-1 px-2 py-1 border border-slate-200 rounded text-xs ${isEdit ? 'bg-slate-50 text-slate-500' : ''}`} />
                        <input type="number" placeholder="分值" value={opt.value} readOnly={isEdit}
                          onChange={(e) => { const u = [...items]; u[ii].options[oi].value = Number(e.target.value); setItems(u); }}
                          className={`w-16 px-2 py-1 border border-slate-200 rounded text-xs ${isEdit ? 'bg-slate-50 text-slate-500' : ''}`} />
                        {!isEdit && item.options.length > 1 && (
                          <button type="button" onClick={() => { const u = [...items]; u[ii].options = u[ii].options.filter((_, i) => i !== oi); setItems(u); }} className="text-xs text-red-400">x</button>
                        )}
                      </div>
                    ))}
                    {!isEdit && (
                      <button type="button" onClick={() => addOption(ii)} className="text-xs text-brand-600 hover:underline">+ 添加选项</button>
                    )}
                  </div>
                </div>
                {!isEdit && items.length > 1 && (
                  <button type="button" onClick={() => setItems(items.filter((_, i) => i !== ii))} className="text-xs text-red-500 mt-2">删除</button>
                )}
              </div>
            </div>
          ))}
        </section>

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
          <button type="submit" disabled={createScale.isPending || updateScale.isPending} className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50">
            {(createScale.isPending || updateScale.isPending) ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}

import { Plus, Trash2 } from 'lucide-react';
import { Field } from './CardSection';
import { RuleRow } from './RuleRow';
import type { DimensionEdit, RuleEdit } from './types';

/**
 * The "维度" tab — a list of dimensions; each dimension contains a
 * header (name + delete), fields (description, calculation method),
 * and a nested list of interpretation rules rendered via RuleRow.
 */
export function DimensionsTab({
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

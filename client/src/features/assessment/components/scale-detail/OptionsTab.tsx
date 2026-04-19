import { Plus, X } from 'lucide-react';
import { CardSection } from './CardSection';
import type { OptionEdit } from './types';

/**
 * The "选项配置" tab — shared answer options applied to every item
 * on save. Typical 5-point Likert setups live here.
 */
export function OptionsTab({
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

import { Trash2 } from 'lucide-react';
import type { DimensionEdit, ItemEdit } from './types';

/**
 * A single quiz item (question) inside ItemsTab. Kept in its own file
 * because the edit form has non-trivial affordances: dimension picker,
 * reverse-scoring checkbox, per-row delete — ~70 lines on its own.
 */
export function ItemRow({
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
            <p className="text-sm text-slate-700">
              {item.text || <span className="text-slate-300 italic">未填写</span>}
            </p>
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

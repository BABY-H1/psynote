import { useMemo } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { ItemRow } from './ItemRow';
import type { DimensionEdit, ItemEdit } from './types';

/**
 * The "题目" tab — items grouped by dimension with collapsible sections.
 * Handles the empty-dimensions guard, the group-by-dim memoization, and
 * fans out to <ItemRow> for the actual per-question UI.
 */
export function ItemsTab({
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

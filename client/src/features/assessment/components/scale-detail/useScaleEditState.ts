import { useCallback, useState } from 'react';
import type {
  DimensionEdit,
  EditState,
  ItemEdit,
  OptionEdit,
  RuleEdit,
} from './types';

/**
 * Encapsulates the whole editable-state tree + 12 immutable updaters.
 *
 * Pulled out of ScaleDetail.tsx so the main component stays under the
 * 200-line target. The updaters mirror the shape of the EditState tree
 * exactly:
 *   - `updateField(key, value)` — top-level EditState scalars
 *   - `update/add/removeDimension` — dimensions[]
 *   - `update/add/removeRule`      — dimensions[di].rules[]
 *   - `update/add/removeItem`      — items[]
 *   - `update/add/removeOption`    — options[]
 *
 * `removeDimension` is the only one with non-trivial cascade: when a
 * dimension is dropped, items pointing at higher indices must be
 * re-numbered so the array indices stay contiguous.
 */
export function useScaleEditState() {
  const [editData, setEditData] = useState<EditState | null>(null);

  const updateField = useCallback(
    <K extends keyof EditState>(key: K, value: EditState[K]) => {
      setEditData((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

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
    setEditData((prev) =>
      prev
        ? {
            ...prev,
            dimensions: [
              ...prev.dimensions,
              { name: '', description: '', calculationMethod: 'sum', rules: [] },
            ],
          }
        : prev,
    );
  }, []);

  const removeDimension = useCallback((idx: number) => {
    setEditData((prev) => {
      if (!prev) return prev;
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
    setEditData((prev) =>
      prev
        ? {
            ...prev,
            items: [...prev.items, { text: '', dimensionIndex, isReverseScored: false }],
          }
        : prev,
    );
  }, []);

  const removeItem = useCallback((idx: number) => {
    setEditData((prev) =>
      prev ? { ...prev, items: prev.items.filter((_, i) => i !== idx) } : prev,
    );
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
    setEditData((prev) =>
      prev
        ? { ...prev, options: [...prev.options, { label: '', value: prev.options.length }] }
        : prev,
    );
  }, []);

  const removeOption = useCallback((idx: number) => {
    setEditData((prev) =>
      prev ? { ...prev, options: prev.options.filter((_, i) => i !== idx) } : prev,
    );
  }, []);

  return {
    editData,
    setEditData,
    updateField,
    updateDimension,
    addDimension,
    removeDimension,
    updateRule,
    addRule,
    removeRule,
    updateItem,
    addItem,
    removeItem,
    updateOption,
    addOption,
    removeOption,
  };
}

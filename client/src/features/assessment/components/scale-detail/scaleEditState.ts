import type { DimensionEdit, EditState, ItemEdit, OptionEdit } from './types';

/**
 * Inverse of `scaleToEditState`: flatten the UI's editable state back
 * into the payload shape expected by `useUpdateScale.mutateAsync`.
 *
 * Two transforms happen here:
 *   1. `options` is broadcast from the shared array onto every item
 *      (with a safe-default [{label:'',value:0}] when empty so the
 *       backend never sees `options: []`).
 *   2. Empty `rules` arrays become `undefined` so drizzle's onConflict
 *      path treats them as "leave alone" instead of "replace with []".
 */
export function editStateToUpdatePayload(editData: EditState, scaleId: string) {
  const sharedOptions = editData.options.length > 0
    ? editData.options
    : [{ label: '', value: 0 }];

  return {
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
  };
}

/**
 * Convert a backend scale payload into the UI's editable shape.
 *
 * Why not expose backend types directly? Because items reference their
 * dimension by UUID upstream, but the UI edits by array index (so a
 * dimension reorder is cheap). This function collapses both directions:
 *   - dimension.id → dimension array index
 *   - items[0].options → shared `options` array (first-item-wins)
 *
 * The inverse mapping lives in ScaleDetail's `handleSave`, which
 * broadcasts the shared `options` back onto every item before sending.
 */
export function scaleToEditState(scale: any): EditState {
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

  // Shared options: take the first item's options as the canonical set.
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

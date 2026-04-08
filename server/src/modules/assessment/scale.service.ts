import { eq, and, or, isNull, asc, sql, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { scales, scaleDimensions, dimensionRules, scaleItems } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

/** Full scale with nested dimensions (with rules) and items */
export interface FullScale {
  id: string;
  orgId: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  scoringMode: string;
  isPublic: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  dimensions: FullDimension[];
  items: {
    id: string;
    dimensionId: string | null;
    text: string;
    isReverseScored: boolean;
    options: unknown;
    sortOrder: number;
  }[];
}

interface FullDimension {
  id: string;
  name: string;
  description: string | null;
  calculationMethod: string;
  sortOrder: number;
  rules: {
    id: string;
    minScore: string;
    maxScore: string;
    label: string;
    description: string | null;
    advice: string | null;
    riskLevel: string | null;
  }[];
}

/**
 * List scales visible to a given org:
 * - Scales owned by the org
 * - Public platform scales (orgId IS NULL and isPublic)
 */
export async function listScales(orgId: string) {
  const rows = await db
    .select()
    .from(scales)
    .where(
      or(
        eq(scales.orgId, orgId),
        and(isNull(scales.orgId), eq(scales.isPublic, true)),
      ),
    )
    .orderBy(asc(scales.title));

  // Enrich with dimension/item counts for the list view
  const enriched = await Promise.all(
    rows.map(async (scale) => {
      const [dimCount] = await db
        .select({ value: count() })
        .from(scaleDimensions)
        .where(eq(scaleDimensions.scaleId, scale.id));
      const [itemCount] = await db
        .select({ value: count() })
        .from(scaleItems)
        .where(eq(scaleItems.scaleId, scale.id));
      return {
        ...scale,
        dimensionCount: Number(dimCount?.value ?? 0),
        itemCount: Number(itemCount?.value ?? 0),
      };
    }),
  );

  return enriched;
}

/** Get a scale with all nested dimensions, rules, and items */
export async function getScaleById(scaleId: string): Promise<FullScale> {
  const [scale] = await db
    .select()
    .from(scales)
    .where(eq(scales.id, scaleId))
    .limit(1);

  if (!scale) throw new NotFoundError('Scale', scaleId);

  // Load dimensions
  const dims = await db
    .select()
    .from(scaleDimensions)
    .where(eq(scaleDimensions.scaleId, scaleId))
    .orderBy(asc(scaleDimensions.sortOrder));

  // Load rules for all dimensions
  const dimIds = dims.map((d) => d.id);
  const allRules = dimIds.length > 0
    ? await db
        .select()
        .from(dimensionRules)
        .where(or(...dimIds.map((id) => eq(dimensionRules.dimensionId, id))))
    : [];

  // Load items
  const items = await db
    .select()
    .from(scaleItems)
    .where(eq(scaleItems.scaleId, scaleId))
    .orderBy(asc(scaleItems.sortOrder));

  // Assemble
  const fullDimensions: FullDimension[] = dims.map((dim) => ({
    id: dim.id,
    name: dim.name,
    description: dim.description,
    calculationMethod: dim.calculationMethod,
    sortOrder: dim.sortOrder,
    rules: allRules
      .filter((r) => r.dimensionId === dim.id)
      .map((r) => ({
        id: r.id,
        minScore: r.minScore,
        maxScore: r.maxScore,
        label: r.label,
        description: r.description,
        advice: r.advice,
        riskLevel: r.riskLevel,
      })),
  }));

  return {
    ...scale,
    dimensions: fullDimensions,
    items: items.map((it) => ({
      id: it.id,
      dimensionId: it.dimensionId,
      text: it.text,
      isReverseScored: it.isReverseScored,
      options: it.options,
      sortOrder: it.sortOrder,
    })),
  };
}

/** Create a scale with dimensions, rules, and items in one transaction */
export async function createScale(input: {
  orgId: string;
  title: string;
  description?: string;
  instructions?: string;
  scoringMode?: string;
  isPublic?: boolean;
  createdBy: string;
  dimensions: {
    name: string;
    description?: string;
    calculationMethod?: string;
    sortOrder?: number;
    rules?: {
      minScore: number;
      maxScore: number;
      label: string;
      description?: string;
      advice?: string;
      riskLevel?: string;
    }[];
  }[];
  items: {
    text: string;
    dimensionIndex: number; // index into the dimensions array
    isReverseScored?: boolean;
    options: { label: string; value: number }[];
    sortOrder?: number;
  }[];
}) {
  // Insert scale
  const [scale] = await db.insert(scales).values({
    orgId: input.orgId,
    title: input.title,
    description: input.description,
    instructions: input.instructions,
    scoringMode: input.scoringMode || 'sum',
    isPublic: input.isPublic || false,
    createdBy: input.createdBy,
  }).returning();

  // Insert dimensions
  const dimInserts = input.dimensions.map((dim, idx) => ({
    scaleId: scale.id,
    name: dim.name,
    description: dim.description,
    calculationMethod: dim.calculationMethod || 'sum',
    sortOrder: dim.sortOrder ?? idx,
  }));

  const insertedDims = dimInserts.length > 0
    ? await db.insert(scaleDimensions).values(dimInserts).returning()
    : [];

  // Insert dimension rules
  for (let i = 0; i < insertedDims.length; i++) {
    const dimRules = input.dimensions[i].rules;
    if (dimRules && dimRules.length > 0) {
      await db.insert(dimensionRules).values(
        dimRules.map((rule) => ({
          dimensionId: insertedDims[i].id,
          minScore: String(rule.minScore),
          maxScore: String(rule.maxScore),
          label: rule.label,
          description: rule.description,
          advice: rule.advice,
          riskLevel: rule.riskLevel,
        })),
      );
    }
  }

  // Insert items
  if (input.items.length > 0) {
    await db.insert(scaleItems).values(
      input.items.map((item, idx) => ({
        scaleId: scale.id,
        dimensionId: insertedDims[item.dimensionIndex]?.id ?? null,
        text: item.text,
        isReverseScored: item.isReverseScored || false,
        options: item.options,
        sortOrder: item.sortOrder ?? idx,
      })),
    );
  }

  return getScaleById(scale.id);
}

interface DimensionUpdateInput {
  name: string;
  description?: string;
  calculationMethod?: string;
  sortOrder?: number;
  rules?: {
    minScore: number;
    maxScore: number;
    label: string;
    description?: string;
    advice?: string;
    riskLevel?: string;
  }[];
}

interface ItemUpdateInput {
  text: string;
  dimensionIndex: number;
  isReverseScored?: boolean;
  options: { label: string; value: number }[];
  sortOrder?: number;
}

/**
 * Update a scale.
 * - Always updates the top-level scale fields that were passed.
 * - If `dimensions` is passed, `items` MUST also be passed (and vice
 *   versa). Sending one without the other is rejected, because
 *   item.dimensionIndex needs to be resolved against a known
 *   dimension order. We replace both as one atomic operation.
 *
 * Replacement strategy (in transaction):
 *   1. Delete items (must come first — items.dimensionId FK blocks
 *      dimension deletion since the column has no ON DELETE clause).
 *   2. Delete dimensions (cascades to rules).
 *   3. Re-insert dimensions and capture their new ids in order.
 *   4. Re-insert rules linked to new dimension ids.
 *   5. Re-insert items linked to new dimension ids by index.
 */
export async function updateScale(
  scaleId: string,
  updates: Partial<{
    title: string;
    description: string;
    instructions: string;
    scoringMode: string;
    isPublic: boolean;
    dimensions: DimensionUpdateInput[];
    items: ItemUpdateInput[];
  }>,
) {
  const { dimensions: newDimensions, items: newItems, ...scalarUpdates } = updates;

  // Either both nested arrays are provided or neither — they must be
  // updated atomically to keep item.dimensionId consistent.
  if ((newDimensions === undefined) !== (newItems === undefined)) {
    throw new Error(
      'updateScale: dimensions and items must be sent together (or neither)',
    );
  }

  await db.transaction(async (tx) => {
    // 1. Update top-level fields
    const hasScalarChanges = Object.keys(scalarUpdates).length > 0;
    if (hasScalarChanges) {
      const [updated] = await tx
        .update(scales)
        .set({ ...scalarUpdates, updatedAt: new Date() })
        .where(eq(scales.id, scaleId))
        .returning();
      if (!updated) throw new NotFoundError('Scale', scaleId);
    } else if (newDimensions !== undefined) {
      // Touch updatedAt when only nested data changed
      await tx
        .update(scales)
        .set({ updatedAt: new Date() })
        .where(eq(scales.id, scaleId));
    }

    if (newDimensions === undefined || newItems === undefined) {
      return;
    }

    // 2. Drop existing items first (FK to dimensions has no cascade)
    await tx.delete(scaleItems).where(eq(scaleItems.scaleId, scaleId));

    // 3. Drop existing dimensions (cascades rules)
    await tx.delete(scaleDimensions).where(eq(scaleDimensions.scaleId, scaleId));

    // 4. Re-insert dimensions
    let dimensionIdMap: string[] = [];
    if (newDimensions.length > 0) {
      const inserted = await tx
        .insert(scaleDimensions)
        .values(
          newDimensions.map((dim, idx) => ({
            scaleId,
            name: dim.name,
            description: dim.description,
            calculationMethod: dim.calculationMethod || 'sum',
            sortOrder: dim.sortOrder ?? idx,
          })),
        )
        .returning();
      dimensionIdMap = inserted.map((d) => d.id);

      // 5. Re-insert rules linked to new dimension ids
      for (let i = 0; i < inserted.length; i++) {
        const dimRules = newDimensions[i].rules;
        if (dimRules && dimRules.length > 0) {
          await tx.insert(dimensionRules).values(
            dimRules.map((rule) => ({
              dimensionId: inserted[i].id,
              minScore: String(rule.minScore),
              maxScore: String(rule.maxScore),
              label: rule.label,
              description: rule.description,
              advice: rule.advice,
              riskLevel: rule.riskLevel,
            })),
          );
        }
      }
    }

    // 6. Re-insert items linked to new dimension ids
    if (newItems.length > 0) {
      await tx.insert(scaleItems).values(
        newItems.map((item, idx) => ({
          scaleId,
          dimensionId: dimensionIdMap[item.dimensionIndex] ?? null,
          text: item.text,
          isReverseScored: item.isReverseScored || false,
          options: item.options,
          sortOrder: item.sortOrder ?? idx,
        })),
      );
    }
  });

  return getScaleById(scaleId);
}

/** Delete a scale and all its children (cascading) */
export async function deleteScale(scaleId: string) {
  const [deleted] = await db
    .delete(scales)
    .where(eq(scales.id, scaleId))
    .returning();

  if (!deleted) throw new NotFoundError('Scale', scaleId);
  return deleted;
}

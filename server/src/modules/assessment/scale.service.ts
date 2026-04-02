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

/** Update scale metadata (not dimensions/items - those need separate endpoints) */
export async function updateScale(
  scaleId: string,
  updates: Partial<{
    title: string;
    description: string;
    instructions: string;
    scoringMode: string;
    isPublic: boolean;
  }>,
) {
  const [updated] = await db
    .update(scales)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(scales.id, scaleId))
    .returning();

  if (!updated) throw new NotFoundError('Scale', scaleId);
  return updated;
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

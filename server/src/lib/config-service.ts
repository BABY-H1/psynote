/**
 * System configuration service with in-memory cache.
 * Loads all config from DB at startup, provides sync reads and async writes.
 */

import { db } from '../config/database.js';
import { systemConfig } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

// In-memory cache: key = "category.key", value = parsed JSON
const cache = new Map<string, unknown>();
// Boot snapshot for detecting restart-required changes
const bootSnapshot = new Map<string, unknown>();
let initialized = false;

/** Load all config from DB into memory cache */
export async function initConfigService(): Promise<void> {
  try {
    const rows = await db.select().from(systemConfig);
    cache.clear();
    for (const row of rows) {
      const key = `${row.category}.${row.key}`;
      cache.set(key, row.value);
      bootSnapshot.set(key, row.value);
    }
    initialized = true;
  } catch (err) {
    // Table may not exist yet (migration not run). Start with empty cache;
    // all reads will return their fallback values.
    console.warn('Config service: failed to load from DB, using defaults.', (err as Error).message);
    initialized = true;
  }
}

/** Read a single config value (synchronous, from cache) */
export function getConfig<T>(category: string, key: string, fallback: T): T {
  const cacheKey = `${category}.${key}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) as T;
  return fallback;
}

/** Get all config as a structured object for the admin API */
export function getAllConfig(): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of cache) {
    const [category, configKey] = key.split('.');
    if (!result[category]) result[category] = {};
    result[category][configKey] = value;
  }
  return result;
}

/** Write a single config value (async, writes to DB + updates cache) */
export async function setConfig(
  category: string,
  key: string,
  value: unknown,
  userId: string,
): Promise<void> {
  const cacheKey = `${category}.${key}`;

  await db
    .update(systemConfig)
    .set({ value, updatedAt: new Date(), updatedBy: userId })
    .where(and(eq(systemConfig.category, category), eq(systemConfig.key, key)));

  cache.set(cacheKey, value);
}

/** Get list of restart-required keys that have changed since boot */
export function getRestartRequired(): string[] {
  const changed: string[] = [];
  for (const [key, bootValue] of bootSnapshot) {
    const currentValue = cache.get(key);
    if (JSON.stringify(currentValue) !== JSON.stringify(bootValue)) {
      changed.push(key);
    }
  }
  return changed;
}

/** Get the boot-time snapshot value for a specific key */
export function getBootValue<T>(category: string, key: string, fallback: T): T {
  const cacheKey = `${category}.${key}`;
  if (bootSnapshot.has(cacheKey)) return bootSnapshot.get(cacheKey) as T;
  return fallback;
}

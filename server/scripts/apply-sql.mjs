#!/usr/bin/env node
/**
 * Run a raw SQL migration file against DATABASE_URL.
 *
 * Usage:
 *   node scripts/apply-sql.mjs drizzle/0005_crisis_cases.sql
 *
 * Intentionally bare-bones: we use this when `drizzle-kit` interactive prompts
 * get in the way (typically on renames / ambiguous rewrites). Each file is
 * expected to be idempotent (IF NOT EXISTS) so re-running is safe.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import 'dotenv/config';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/apply-sql.mjs <path-to-sql-file>');
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });
const absPath = path.resolve(file);
const content = await readFile(absPath, 'utf8');

console.log(`Applying ${absPath} ...`);
try {
  await sql.unsafe(content);
  console.log('OK');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}

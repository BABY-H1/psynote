/**
 * Migration 010: Phase 9β — Measurement-Based Care (MBC) loop
 *
 * - Add `client_visible` to assessment_results (default false)
 * - Add `recommendations` jsonb to assessment_results (default [])
 *
 * Rationale: SimplePractice's MBC moment is the most successful piece of their
 * L2 — auto-scored, longitudinal, risk-flagged. We mirror that and go further
 * by exposing the trajectory back to the learner via portal (gated by
 * client_visible per result so the counselor controls what the client sees).
 *
 * The `recommendations` column stores the AI triage output as a structured
 * array so the suggestion panel can render it without re-running the LLM.
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    console.log('Starting migration 010: assessment MBC...');

    await sql`
      ALTER TABLE assessment_results
      ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT false`;
    console.log('  ✓ Added assessment_results.client_visible');

    await sql`
      ALTER TABLE assessment_results
      ADD COLUMN IF NOT EXISTS recommendations jsonb NOT NULL DEFAULT '[]'::jsonb`;
    console.log('  ✓ Added assessment_results.recommendations');

    console.log('Migration 010 complete.');
  } catch (err) {
    console.error('Migration 010 failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

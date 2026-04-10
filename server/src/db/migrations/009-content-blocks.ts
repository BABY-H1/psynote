/**
 * Migration 009: Phase 9α — C-facing content blocks for courses & group sessions
 *
 * - Create course_content_blocks table
 *   (distinct from course_lesson_blocks which is teacher-facing outline)
 * - Create group_session_blocks table
 * - Create enrollment_block_responses table (learner answers + progress + safety flags)
 *
 * Rationale: the existing course_lesson_blocks.blockType enum is teacher-oriented
 * (objectives/key_points/preparation/warmup/main_activity/...) and stores only text.
 * For true C-facing delivery we need structured, typed blocks (video/audio/rich_text/
 * pdf/quiz/reflection/worksheet/check_in) with visibility control and response storage.
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    console.log('Starting migration 009: content blocks...');

    // 1. course_content_blocks
    await sql`
      CREATE TABLE IF NOT EXISTS course_content_blocks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        chapter_id uuid NOT NULL REFERENCES course_chapters(id) ON DELETE CASCADE,
        block_type text NOT NULL,
        visibility text NOT NULL DEFAULT 'participant',
        sort_order integer NOT NULL DEFAULT 0,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_course_content_blocks_chapter ON course_content_blocks(chapter_id, sort_order)`;
    console.log('  ✓ Created course_content_blocks');

    // 2. group_session_blocks
    await sql`
      CREATE TABLE IF NOT EXISTS group_session_blocks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        scheme_session_id uuid NOT NULL REFERENCES group_scheme_sessions(id) ON DELETE CASCADE,
        block_type text NOT NULL,
        visibility text NOT NULL DEFAULT 'both',
        sort_order integer NOT NULL DEFAULT 0,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_group_session_blocks_session ON group_session_blocks(scheme_session_id, sort_order)`;
    console.log('  ✓ Created group_session_blocks');

    // 3. enrollment_block_responses
    await sql`
      CREATE TABLE IF NOT EXISTS enrollment_block_responses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        enrollment_id uuid NOT NULL,
        enrollment_type text NOT NULL,
        block_id uuid NOT NULL,
        block_type text NOT NULL,
        response jsonb,
        completed_at timestamptz,
        safety_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
        reviewed_by_counselor boolean NOT NULL DEFAULT false,
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollment_block_response
      ON enrollment_block_responses(enrollment_id, enrollment_type, block_id)`;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_enrollment_block_responses_enrollment
      ON enrollment_block_responses(enrollment_id, enrollment_type)`;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_enrollment_block_responses_safety
      ON enrollment_block_responses(reviewed_by_counselor)`;
    console.log('  ✓ Created enrollment_block_responses');

    console.log('Migration 009 complete.');
  } catch (err) {
    console.error('Migration 009 failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

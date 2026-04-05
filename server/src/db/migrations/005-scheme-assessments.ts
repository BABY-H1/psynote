/**
 * Migration: Add assessment fields to schemes/sessions, update instances
 * - group_schemes: add recruitmentAssessments, overallAssessments, screeningNotes
 * - group_scheme_sessions: replace relatedAssessmentId with relatedAssessments (jsonb)
 * - group_instances: replace fixed pre/post/screening IDs with flexible arrays
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    console.log('Starting migration 005: scheme assessments...');

    // 1. group_schemes: add assessment recommendation fields
    await sql`ALTER TABLE group_schemes ADD COLUMN IF NOT EXISTS recruitment_assessments jsonb DEFAULT '[]'`;
    await sql`ALTER TABLE group_schemes ADD COLUMN IF NOT EXISTS overall_assessments jsonb DEFAULT '[]'`;
    await sql`ALTER TABLE group_schemes ADD COLUMN IF NOT EXISTS screening_notes text`;
    console.log('  ✓ group_schemes: added assessment fields');

    // 2. group_scheme_sessions: migrate relatedAssessmentId → relatedAssessments
    // First add new column
    await sql`ALTER TABLE group_scheme_sessions ADD COLUMN IF NOT EXISTS related_assessments jsonb DEFAULT '[]'`;
    // Migrate existing data: if relatedAssessmentId exists, wrap it in an array
    await sql`
      UPDATE group_scheme_sessions
      SET related_assessments = jsonb_build_array(related_assessment_id::text)
      WHERE related_assessment_id IS NOT NULL
        AND (related_assessments = '[]'::jsonb OR related_assessments IS NULL)
    `;
    // Drop old column
    await sql`ALTER TABLE group_scheme_sessions DROP COLUMN IF EXISTS related_assessment_id`;
    console.log('  ✓ group_scheme_sessions: migrated to relatedAssessments[]');

    // 3. group_instances: add flexible assessment arrays
    await sql`ALTER TABLE group_instances ADD COLUMN IF NOT EXISTS recruitment_assessments jsonb DEFAULT '[]'`;
    await sql`ALTER TABLE group_instances ADD COLUMN IF NOT EXISTS overall_assessments jsonb DEFAULT '[]'`;
    await sql`ALTER TABLE group_instances ADD COLUMN IF NOT EXISTS screening_notes text`;

    // Migrate existing fixed IDs into the new arrays
    await sql`
      UPDATE group_instances
      SET recruitment_assessments = jsonb_build_array(screening_assessment_id::text)
      WHERE screening_assessment_id IS NOT NULL
        AND (recruitment_assessments = '[]'::jsonb OR recruitment_assessments IS NULL)
    `;
    await sql`
      UPDATE group_instances
      SET overall_assessments = (
        CASE
          WHEN pre_assessment_id IS NOT NULL AND post_assessment_id IS NOT NULL
            THEN jsonb_build_array(pre_assessment_id::text, post_assessment_id::text)
          WHEN pre_assessment_id IS NOT NULL
            THEN jsonb_build_array(pre_assessment_id::text)
          WHEN post_assessment_id IS NOT NULL
            THEN jsonb_build_array(post_assessment_id::text)
          ELSE '[]'::jsonb
        END
      )
      WHERE (pre_assessment_id IS NOT NULL OR post_assessment_id IS NOT NULL)
        AND (overall_assessments = '[]'::jsonb OR overall_assessments IS NULL)
    `;

    // Drop old columns
    await sql`ALTER TABLE group_instances DROP COLUMN IF EXISTS screening_assessment_id`;
    await sql`ALTER TABLE group_instances DROP COLUMN IF EXISTS pre_assessment_id`;
    await sql`ALTER TABLE group_instances DROP COLUMN IF EXISTS post_assessment_id`;
    console.log('  ✓ group_instances: migrated to flexible assessment arrays');

    console.log('Migration 005 complete!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();

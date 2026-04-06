/**
 * Migration 008: Course center overhaul
 * - Add creation_mode to courses
 * - Create course_attachments table
 * - Create course_instances table
 * - Alter course_enrollments with instance/approval columns
 * - Create feedback forms + responses tables
 * - Create homework defs + submissions tables
 * - Create interaction responses table (P2 schema)
 * - Migrate lesson block types to 教案 format
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    console.log('Starting migration 008: course center overhaul...');

    // 1. Add creation_mode to courses
    await sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS creation_mode text NOT NULL DEFAULT 'manual'`;
    console.log('  ✓ Added creation_mode to courses');

    // 2. Course attachments
    await sql`
      CREATE TABLE IF NOT EXISTS course_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        chapter_id uuid NOT NULL REFERENCES course_chapters(id) ON DELETE CASCADE,
        file_name text NOT NULL,
        file_url text NOT NULL,
        file_type text NOT NULL,
        file_size integer,
        sort_order integer NOT NULL DEFAULT 0,
        uploaded_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_course_attachments_chapter ON course_attachments(chapter_id)`;
    console.log('  ✓ Created course_attachments table');

    // 3. Course instances
    await sql`
      CREATE TABLE IF NOT EXISTS course_instances (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        course_id uuid NOT NULL REFERENCES courses(id),
        title text NOT NULL,
        description text,
        publish_mode text NOT NULL DEFAULT 'assign',
        status text NOT NULL DEFAULT 'draft',
        capacity integer,
        target_group_label text,
        responsible_id uuid REFERENCES users(id),
        created_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_course_instances_org ON course_instances(org_id, status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_course_instances_course ON course_instances(course_id)`;
    console.log('  ✓ Created course_instances table');

    // 4. Alter course_enrollments
    await sql`ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS instance_id uuid REFERENCES course_instances(id)`;
    await sql`ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS enrollment_source text DEFAULT 'self_enroll'`;
    await sql`ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'auto_approved'`;
    await sql`ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id)`;
    console.log('  ✓ Added instance/enrollment columns to course_enrollments');

    // 5. Feedback forms
    await sql`
      CREATE TABLE IF NOT EXISTS course_feedback_forms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        instance_id uuid NOT NULL REFERENCES course_instances(id) ON DELETE CASCADE,
        chapter_id uuid REFERENCES course_chapters(id),
        title text,
        questions jsonb NOT NULL DEFAULT '[]',
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_course_feedback_forms_instance ON course_feedback_forms(instance_id, chapter_id)`;
    console.log('  ✓ Created course_feedback_forms table');

    // 6. Feedback responses
    await sql`
      CREATE TABLE IF NOT EXISTS course_feedback_responses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        form_id uuid NOT NULL REFERENCES course_feedback_forms(id) ON DELETE CASCADE,
        enrollment_id uuid NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
        answers jsonb NOT NULL DEFAULT '[]',
        submitted_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(form_id, enrollment_id)
      )`;
    console.log('  ✓ Created course_feedback_responses table');

    // 7. Homework definitions
    await sql`
      CREATE TABLE IF NOT EXISTS course_homework_defs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        instance_id uuid NOT NULL REFERENCES course_instances(id) ON DELETE CASCADE,
        chapter_id uuid REFERENCES course_chapters(id),
        title text,
        description text,
        question_type text NOT NULL DEFAULT 'text',
        options jsonb,
        is_required boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_course_homework_defs_instance ON course_homework_defs(instance_id, chapter_id)`;
    console.log('  ✓ Created course_homework_defs table');

    // 8. Homework submissions
    await sql`
      CREATE TABLE IF NOT EXISTS course_homework_submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        homework_def_id uuid NOT NULL REFERENCES course_homework_defs(id) ON DELETE CASCADE,
        enrollment_id uuid NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
        content text,
        selected_options jsonb,
        status text NOT NULL DEFAULT 'submitted',
        review_comment text,
        reviewed_by uuid REFERENCES users(id),
        reviewed_at timestamptz,
        submitted_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(homework_def_id, enrollment_id)
      )`;
    console.log('  ✓ Created course_homework_submissions table');

    // 9. Interaction responses (P2 schema)
    await sql`
      CREATE TABLE IF NOT EXISTS course_interaction_responses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        block_id uuid NOT NULL REFERENCES course_lesson_blocks(id) ON DELETE CASCADE,
        instance_id uuid REFERENCES course_instances(id),
        enrollment_id uuid REFERENCES course_enrollments(id),
        response_type text NOT NULL,
        response_data jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_course_interaction_responses_block ON course_interaction_responses(block_id, instance_id)`;
    console.log('  ✓ Created course_interaction_responses table');

    // 10. Migrate lesson block types to 教案 format
    await sql`UPDATE course_lesson_blocks SET block_type = 'warmup' WHERE block_type = 'opening'`;
    await sql`UPDATE course_lesson_blocks SET block_type = 'main_activity' WHERE block_type = 'core_content'`;
    await sql`UPDATE course_lesson_blocks SET block_type = 'experience' WHERE block_type = 'interaction'`;
    await sql`UPDATE course_lesson_blocks SET block_type = 'extension' WHERE block_type = 'homework'`;
    await sql`UPDATE course_lesson_blocks SET block_type = 'main_activity' WHERE block_type = 'case_demo'`;
    await sql`UPDATE course_lesson_blocks SET block_type = 'experience' WHERE block_type = 'practice'`;
    await sql`UPDATE course_lesson_blocks SET block_type = 'sharing' WHERE block_type = 'post_reminder'`;
    await sql`UPDATE course_lesson_blocks SET block_type = 'reflection' WHERE block_type = 'counselor_notes'`;
    console.log('  ✓ Migrated lesson block types to 教案 format');

    // 11. Set existing courses with blueprintData to ai_assisted mode
    await sql`UPDATE courses SET creation_mode = 'ai_assisted' WHERE blueprint_data IS NOT NULL AND blueprint_data::text != '{}'`;
    console.log('  ✓ Updated creation_mode for existing courses');

    console.log('Migration 008 complete!');
  } catch (err) {
    console.error('Migration 008 failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

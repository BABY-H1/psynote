/**
 * Migration 022: School support — 学校版支持
 *
 * New tables:
 *   - school_classes: 班级管理（年级→班级，关联班主任）
 *   - school_student_profiles: 学生扩展信息（学号、年级、班级、家长联系方式）
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    // ── 1. school_classes ─────────────────────────────────────────
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS school_classes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        grade TEXT NOT NULL,
        class_name TEXT NOT NULL,
        homeroom_teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
        student_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(org_id, grade, class_name)
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_school_classes_org ON school_classes(org_id)`);
    console.log('  ✓ school_classes');

    // ── 2. school_student_profiles ────────────────────────────────
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS school_student_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        student_id TEXT,
        grade TEXT,
        class_name TEXT,
        parent_name TEXT,
        parent_phone TEXT,
        parent_email TEXT,
        entry_method TEXT DEFAULT 'import',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(org_id, user_id)
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_school_students_org_grade ON school_student_profiles(org_id, grade)`);
    console.log('  ✓ school_student_profiles');

    console.log('[migration-022] Done — School tables created');
  } catch (err) {
    console.error('[migration-022] Failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

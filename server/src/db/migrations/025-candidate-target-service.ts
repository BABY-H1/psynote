/**
 * Migration 025: Candidate pool — target service FK columns.
 *
 * workflow 规则产生的 group_candidate / course_candidate 现在可以把目标
 * 团辅/课程实例 ID 写到 candidate_pool,让 GroupInstanceDetail /
 * CourseInstanceDetail 的"候选"tab 按 targetGroupInstanceId /
 * targetCourseInstanceId 反查"指向本服务的候选名单"。
 *
 * 此前所有 group_candidate / course_candidate 只在文本 `suggestion` 里
 * 描述目标服务,交付中心没有 UI 入口,候选只能在协作中心通用列表里逐个处理。
 * 既有行保留 NULL — 规则引擎下一次写入时填充。
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    await sql.unsafe(`
      ALTER TABLE candidate_pool
        ADD COLUMN IF NOT EXISTS target_group_instance_id UUID
          REFERENCES group_instances(id) ON DELETE SET NULL
    `);
    console.log('  ✓ candidate_pool.target_group_instance_id');

    await sql.unsafe(`
      ALTER TABLE candidate_pool
        ADD COLUMN IF NOT EXISTS target_course_instance_id UUID
          REFERENCES course_instances(id) ON DELETE SET NULL
    `);
    console.log('  ✓ candidate_pool.target_course_instance_id');

    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_candidate_pool_target_group
        ON candidate_pool(target_group_instance_id, status)
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_candidate_pool_target_course
        ON candidate_pool(target_course_instance_id, status)
    `);
    console.log('  ✓ indexes');

    console.log('[migration-025] Done');
  } catch (err) {
    console.error('[migration-025] Failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

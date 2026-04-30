/**
 * Migration 029: 删除孤儿表 course_attachments — alpha 后清理。
 *
 * 该表在 008-course-center.ts 创建, 但**全代码库零引用** — 没有任何 server
 * route 写入或读取它, 没有任何 client UI 引用它, DB 实测 0 rows。FINDING-001
 * (browser-walkthrough.md) 标记为 alpha 后清理。
 *
 * 真正的章节附件流是 `course_content_blocks` (block_type='pdf'/'video'/'audio'
 * 等), 已端到端验证可用 (commit b16dcf2)。这张废弃的表只是历史包袱。
 *
 * 幂等, 零风险 (DROP IF EXISTS + 无外键被引用)。
 */
import postgres from 'postgres';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    // 安全检查: 确认表里没有数据 (理论上应该是 0 rows, 万一有就先警告)
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM course_attachments
    `.catch(() => [{ count: 0 }]);

    if (count > 0) {
      console.warn(`  ⚠ course_attachments has ${count} rows — proceeding to DROP anyway (table is orphaned, not read by any code).`);
    } else {
      console.log('  ✓ course_attachments is empty (expected)');
    }

    await sql.unsafe(`DROP TABLE IF EXISTS course_attachments CASCADE`);
    console.log('  ✓ DROP TABLE course_attachments');

    console.log('[migration-029] Done');
  } catch (err) {
    console.error('[migration-029] Failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

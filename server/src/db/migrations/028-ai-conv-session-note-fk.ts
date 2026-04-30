/**
 * Migration 028: ai_conversations 加 session_note_id FK — Phase I Issue 1.
 *
 * 用途: 让写笔记 mode (mode='note') 的 ai_conversation 在用户点 "保存笔记"
 * 创建 sessionNote 时, 把对话关联过去. LeftPanel 因此可以把"草稿对话"
 * 显示在 "会谈记录" 区里, 而不是 "AI 对话" 区. 这是 BUG-009 后续: 之前
 * BUG-009 让 4 mode 都归档, 但归到了 "AI 对话" 区, 用户反馈写笔记的
 * 中间过程在语义上属于会谈记录工作流.
 *
 * 字段: session_note_id uuid NULL, FK → session_notes(id) ON DELETE SET NULL.
 * - NULL = 草稿状态 (尚未保存为正式 sessionNote)
 * - 非 NULL = 已绑定到某个 sessionNote, 是它的 AI 草稿过程
 *
 * 幂等, 零风险, 用 ADD COLUMN IF NOT EXISTS.
 */
import postgres from 'postgres';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    await sql.unsafe(`
      ALTER TABLE ai_conversations
        ADD COLUMN IF NOT EXISTS session_note_id uuid
        REFERENCES session_notes(id) ON DELETE SET NULL
    `);
    console.log('  ✓ ai_conversations.session_note_id added');

    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_session_note
        ON ai_conversations(session_note_id)
        WHERE session_note_id IS NOT NULL
    `);
    console.log('  ✓ idx_ai_conversations_session_note (partial)');

    console.log('[migration-028] Done');
  } catch (err) {
    console.error('[migration-028] Failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

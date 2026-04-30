/**
 * Migration 027: password_reset_tokens — forgot-password / reset-password 流程。
 *
 * 幂等、零风险,所有语句都用 IF NOT EXISTS。详细设计见 schema.ts 的
 * `passwordResetTokens` 定义 + docs/deployment/alpha.md §5。
 */
import postgres from 'postgres';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    console.log('  ✓ password_reset_tokens');

    await sql.unsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_token_hash
        ON password_reset_tokens(token_hash)
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_user_expires
        ON password_reset_tokens(user_id, expires_at)
    `);
    console.log('  ✓ indexes');

    console.log('[migration-027] Done');
  } catch (err) {
    console.error('[migration-027] Failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

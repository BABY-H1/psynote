/**
 * Migration 017: Create system_config table.
 *
 * Stores editable platform-wide configuration as key-value pairs
 * grouped by category. Values are JSONB so they can hold strings,
 * numbers, booleans, or objects.
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS system_config (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category      TEXT NOT NULL,
        key           TEXT NOT NULL,
        value         JSONB NOT NULL,
        description   TEXT,
        requires_restart BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by    UUID REFERENCES users(id),
        UNIQUE (category, key)
      );
    `;

    // Seed default values (ON CONFLICT = skip if already seeded)
    await sql`
      INSERT INTO system_config (category, key, value, description, requires_restart)
      VALUES
        ('platform', 'name',              '"Psynote"',  '平台名称',           false),
        ('platform', 'version',           '"1.0.0"',    '版本号',             false),
        ('security', 'accessTokenExpiry', '"7d"',       'Access Token 有效期', true),
        ('security', 'refreshTokenExpiry','"30d"',      'Refresh Token 有效期', true),
        ('security', 'minPasswordLength', '6',          '最小密码长度',        false),
        ('defaults', 'orgPlan',           '"free"',     '新机构默认套餐',      false),
        ('defaults', 'maxMembersPerOrg',  '100',        '每机构最大成员数',    false),
        ('limits',   'rateLimitMax',      '100',        '每分钟最大请求数',    true),
        ('limits',   'fileUploadMaxMB',   '200',        '文件上传限制(MB)',    true)
      ON CONFLICT (category, key) DO NOTHING;
    `;

    console.log('Migration 017: system_config table created and seeded.');
  } catch (err) {
    console.error('Migration 017 failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();

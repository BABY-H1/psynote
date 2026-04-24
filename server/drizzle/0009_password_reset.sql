-- 密码重置 token 表
--
-- 背景:alpha 上线需要密码重置流程。咨询师和来访者忘记密码时走:
--   POST /api/auth/forgot-password → 生成 token,DB 只存 sha256(token),
--   邮件里带明文 token → 用户点链接 → POST /api/auth/reset-password
--   → 校验(hash 匹配 + 未过期 + 未 used)→ 改 passwordHash + 标 used。
--
-- 即使 DB 泄漏,attacker 拿到的 token_hash 不可回放(一次性 SHA256)。
-- 15 min 过期,一次性。详见 docs/deployment/alpha.md §5。

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_password_reset_token_hash"
  ON "password_reset_tokens"("token_hash");

CREATE INDEX IF NOT EXISTS "idx_password_reset_user_expires"
  ON "password_reset_tokens"("user_id", "expires_at");

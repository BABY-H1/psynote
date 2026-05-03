import { z } from 'zod';
import 'dotenv/config';

// Exported so tests can validate the schema directly without going through
// the process.exit() side-effect path. See env.test.ts.
export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  /**
   * JWT_SECRET is REQUIRED — no default, no fallback.
   *
   * Historical bug (W0.3 fix, security audit 2026-05-03): a default literal
   * `'psynote-dev-secret-change-in-production'` was used here. The hard-fail
   * only triggered when NODE_ENV === 'production' AND the value matched the
   * literal exactly. Any other env (test/staging/missing) silently booted
   * with the publicly-known default — meaning anyone reading the public repo
   * could forge JWTs (including isSystemAdmin: true tokens).
   *
   * Now: required, ≥ 32 chars, hard-fail in every environment if missing.
   * Pinned by `env.test.ts`.
   */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  AI_MODEL: z.string().default('gpt-4o'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  // 密码重置邮件链接基址(通常同 CLIENT_URL)
  PUBLIC_BASE_URL: z.string().optional(),
  // SMTP (密码重置邮件必需;production 启动时若缺会拒启,见 lib/mailer.ts)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

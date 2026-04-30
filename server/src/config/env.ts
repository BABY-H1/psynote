import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().default('psynote-dev-secret-change-in-production'),
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

// Hard-fail if production is missing JWT secret
if (env.NODE_ENV === 'production' && env.JWT_SECRET === 'psynote-dev-secret-change-in-production') {
  console.error('FATAL: JWT_SECRET must be set to a secure value in production');
  process.exit(1);
}

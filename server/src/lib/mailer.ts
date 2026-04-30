/**
 * 邮件发送中心 —— 密码重置 / 班级邀请等系统邮件走这里。
 *
 * 与已有 lib/notification-sender.ts (提醒通知用的简单发送函数) 的区别:
 * 本模块是**全局单例 transporter + 启动时配置校验**, 专用于**关键路径**
 * 的邮件 (用户无法重来的场景,比如密码重置)。
 *
 * 设计要求(plan Phase B):
 *   - production 环境启动时若 SMTP_* 任一缺失 → 拒启 (而不是 silent skip)
 *   - development / test 环境允许缺失(开发不需要真发,test 完全 mock)
 *   - 所有邮件内容走模板化,中文 UTF-8 编码显式标注
 *
 * 使用:
 *   import { assertMailerReady, sendPasswordResetEmail } from '../lib/mailer';
 *   // 应用启动后
 *   assertMailerReady();
 *   // 业务代码
 *   await sendPasswordResetEmail(user.email, resetLink);
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

let transporter: Transporter | null = null;
let initialized = false;

/**
 * 必填 SMTP 字段清单。缺任一都不能真发邮件。
 */
const REQUIRED_SMTP_FIELDS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const;

function missingSmtpFields(): string[] {
  const missing: string[] = [];
  if (!env.SMTP_HOST) missing.push('SMTP_HOST');
  if (!env.SMTP_USER) missing.push('SMTP_USER');
  if (!env.SMTP_PASS) missing.push('SMTP_PASS');
  if (!env.SMTP_FROM) missing.push('SMTP_FROM');
  return missing;
}

/**
 * 应用启动后必须调用一次。production 环境下若 SMTP 缺失会抛错终止进程,
 * 避免"部署成功但邮件静默丢失"的失败模式。
 */
export function assertMailerReady(): void {
  if (initialized) return;
  initialized = true;

  const missing = missingSmtpFields();
  if (missing.length === 0) {
    // 完整配置,起 transporter
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // 465 → implicit TLS; 587 → STARTTLS
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
    });
    return;
  }

  // 配置不全 —— production 拒启,其他环境仅警告
  const msg = `SMTP 配置不全,缺失: ${missing.join(', ')}`;
  if (env.NODE_ENV === 'production') {
    console.error(`[mailer] FATAL: ${msg}。密码重置等关键邮件无法送达。`);
    throw new Error(`mailer_not_configured: ${missing.join(',')}`);
  }
  console.warn(`[mailer] WARN: ${msg} —— 邮件将落日志,不真发。`);
}

/**
 * 送一封通用邮件。有 transporter 真发,没有就落日志(dev/test)。
 */
async function send(to: string, subject: string, html: string, text: string) {
  if (!transporter) {
    console.log(
      `[mailer] (no transporter, NODE_ENV=${env.NODE_ENV}) to=${to} subject="${subject}"`,
    );
    return;
  }
  await transporter.sendMail({
    from: env.SMTP_FROM!,
    to,
    subject,
    text,
    html,
  });
}

/**
 * 密码重置邮件。resetLink 是前端可点的完整 URL(含 token 查询参数)。
 */
export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
): Promise<void> {
  const subject = '【Psynote】重置密码';
  const text = `您好,

我们收到了您的密码重置请求。请点击以下链接在 15 分钟内完成重置:

${resetLink}

如果您没有发起此请求,请忽略这封邮件,您的密码不会发生变化。

—— Psynote`;

  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#333">
  <p>您好,</p>
  <p>我们收到了您的密码重置请求。请点击以下链接在 <strong>15 分钟</strong> 内完成重置:</p>
  <p><a href="${resetLink}" style="display:inline-block;padding:10px 24px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px">重置密码</a></p>
  <p style="color:#666;font-size:13px">或复制此链接到浏览器:<br><span style="word-break:break-all">${resetLink}</span></p>
  <p style="color:#888;font-size:12px;margin-top:24px">如果您没有发起此请求,请忽略这封邮件,您的密码不会发生变化。</p>
  <p style="color:#888;font-size:12px">—— Psynote</p>
</div>`;

  await send(to, subject, html, text);
}

/**
 * 测试辅助 —— 仅测试环境用,重置单例状态。
 */
export function __resetMailerForTest(): void {
  transporter = null;
  initialized = false;
}

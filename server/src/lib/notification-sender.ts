import nodemailer from 'nodemailer';

interface SendOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export async function sendEmail(config: {
  host?: string; port?: number; user?: string; pass?: string;
}, options: SendOptions) {
  if (!config.host || !config.user) {
    console.log('[Reminder] Email not configured, skipping:', options.subject, '→', options.to);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port || 465,
    secure: true,
    auth: { user: config.user, pass: config.pass },
  });

  await transporter.sendMail({
    from: config.user,
    to: options.to,
    subject: options.subject,
    text: options.body,
    html: options.html || options.body.replace(/\n/g, '<br>'),
  });
}

export function buildReminderMessage(
  template: { subject?: string; body?: string } | null,
  vars: Record<string, string>,
): { subject: string; body: string } {
  const defaultSubject = '预约提醒 - {counselorName}';
  const defaultBody = `{clientName} 您好，

您与 {counselorName} 的咨询预约即将开始：

时间：{time}

如需确认，请点击：{confirmLink}
如需取消，请点击：{cancelLink}

祝好！`;

  let subject = template?.subject || defaultSubject;
  let body = template?.body || defaultBody;

  for (const [key, value] of Object.entries(vars)) {
    subject = subject.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    body = body.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return { subject, body };
}

import { z } from 'zod';

export const triageLevelSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  intervention: z.string().min(1),
  description: z.string(),
  notification: z.object({
    counselor: z.enum(['none', 'normal', 'urgent']),
    admin: z.enum(['none', 'info', 'urgent']),
  }),
});

export const triageConfigSchema = z.object({
  levels: z.array(triageLevelSchema).min(1),
  aggregation: z.enum(['highest', 'weighted_average', 'custom_formula']).default('highest'),
  requireCounselorConfirm: z.boolean().default(true),
  autoActions: z.record(z.array(z.string())).default({}),
});

/** Default four-level triage template (Chinese standard) */
export const DEFAULT_TRIAGE_CONFIG = {
  levels: [
    {
      key: 'level_1',
      label: '一般',
      color: '#22c55e',
      intervention: 'course',
      description: '适应性问题，轻度情绪波动',
      notification: { counselor: 'normal' as const, admin: 'none' as const },
    },
    {
      key: 'level_2',
      label: '关注',
      color: '#eab308',
      intervention: 'group',
      description: '人际困难，中度焦虑/抑郁',
      notification: { counselor: 'normal' as const, admin: 'none' as const },
    },
    {
      key: 'level_3',
      label: '严重',
      color: '#f97316',
      intervention: 'counseling',
      description: '重度焦虑/抑郁，创伤后应激',
      notification: { counselor: 'urgent' as const, admin: 'info' as const },
    },
    {
      key: 'level_4',
      label: '危机',
      color: '#ef4444',
      intervention: 'referral',
      description: '自伤倾向、精神障碍疑似',
      notification: { counselor: 'urgent' as const, admin: 'urgent' as const },
    },
  ],
  aggregation: 'highest' as const,
  requireCounselorConfirm: true,
  autoActions: {
    level_3: ['create_appointment_suggestion'],
    level_4: ['create_appointment_suggestion', 'admin_alert', 'safety_notice_to_client'],
  },
} satisfies z.infer<typeof triageConfigSchema>;

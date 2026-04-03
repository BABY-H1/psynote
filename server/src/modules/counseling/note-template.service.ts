import { eq, and, or, isNull, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { noteTemplates } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

// Built-in format definitions (not stored in DB)
export const BUILT_IN_FORMATS = [
  {
    id: '__soap__',
    title: 'SOAP 笔记',
    format: 'soap',
    fieldDefinitions: [
      { key: 'subjective', label: 'S - 主观资料', placeholder: '来访者自述的感受、想法、问题...', required: true, order: 1 },
      { key: 'objective', label: 'O - 客观资料', placeholder: '咨询师观察到的行为、表情、非语言信息...', required: true, order: 2 },
      { key: 'assessment', label: 'A - 评估分析', placeholder: '临床评估、诊断印象、问题分析...', required: true, order: 3 },
      { key: 'plan', label: 'P - 计划', placeholder: '下一步治疗计划、作业、随访安排...', required: true, order: 4 },
    ],
    isDefault: true,
    visibility: 'public' as const,
  },
  {
    id: '__dap__',
    title: 'DAP 笔记',
    format: 'dap',
    fieldDefinitions: [
      { key: 'data', label: 'D - 资料', placeholder: '主客观信息合并：来访者陈述 + 咨询师观察...', required: true, order: 1 },
      { key: 'assessment', label: 'A - 评估', placeholder: '临床评估与分析...', required: true, order: 2 },
      { key: 'plan', label: 'P - 计划', placeholder: '治疗计划与下一步安排...', required: true, order: 3 },
    ],
    isDefault: false,
    visibility: 'public' as const,
  },
  {
    id: '__birp__',
    title: 'BIRP 笔记',
    format: 'birp',
    fieldDefinitions: [
      { key: 'behavior', label: 'B - 行为', placeholder: '来访者在会谈中的行为表现...', required: true, order: 1 },
      { key: 'intervention', label: 'I - 干预', placeholder: '咨询师使用的干预技术和方法...', required: true, order: 2 },
      { key: 'response', label: 'R - 反应', placeholder: '来访者对干预的反应和回应...', required: true, order: 3 },
      { key: 'plan', label: 'P - 计划', placeholder: '后续计划和安排...', required: true, order: 4 },
    ],
    isDefault: false,
    visibility: 'public' as const,
  },
];

export async function listTemplates(orgId: string, userId: string) {
  // Custom templates: personal + org + public
  const custom = await db
    .select()
    .from(noteTemplates)
    .where(
      or(
        and(eq(noteTemplates.visibility, 'personal'), eq(noteTemplates.createdBy, userId)),
        and(eq(noteTemplates.visibility, 'organization'), eq(noteTemplates.orgId, orgId)),
        eq(noteTemplates.visibility, 'public'),
      ),
    )
    .orderBy(desc(noteTemplates.updatedAt));

  return [...BUILT_IN_FORMATS, ...custom];
}

export async function createTemplate(input: {
  orgId: string;
  title: string;
  format: string;
  fieldDefinitions: unknown[];
  isDefault?: boolean;
  visibility?: string;
  createdBy: string;
}) {
  const [template] = await db
    .insert(noteTemplates)
    .values({
      orgId: input.orgId,
      title: input.title,
      format: input.format,
      fieldDefinitions: input.fieldDefinitions,
      isDefault: input.isDefault || false,
      visibility: input.visibility || 'personal',
      createdBy: input.createdBy,
    })
    .returning();
  return template;
}

export async function updateTemplate(
  templateId: string,
  updates: { title?: string; fieldDefinitions?: unknown[]; visibility?: string; isDefault?: boolean },
) {
  const [updated] = await db
    .update(noteTemplates)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(noteTemplates.id, templateId))
    .returning();
  if (!updated) throw new NotFoundError('NoteTemplate', templateId);
  return updated;
}

export async function deleteTemplate(templateId: string) {
  const [deleted] = await db
    .delete(noteTemplates)
    .where(eq(noteTemplates.id, templateId))
    .returning();
  if (!deleted) throw new NotFoundError('NoteTemplate', templateId);
  return deleted;
}

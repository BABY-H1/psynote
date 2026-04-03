import React, { useState, useMemo } from 'react';
import { useCreateSessionNote, useNoteTemplates } from '../../../api/useCounseling';
import { useToast, PageLoading } from '../../../shared/components';
import { NoteFormatSelector } from './NoteFormatSelector';
import { DynamicNoteFields } from './DynamicNoteFields';
import { NoteGuidanceChat } from './NoteGuidanceChat';
import type { NoteTemplate, NoteFieldDefinition } from '@psynote/shared';

interface Props {
  episodeId: string;
  clientId: string;
  appointmentId?: string;
  chiefComplaint?: string;
  onDone: () => void;
}

const BUILTIN_FIELDS: Record<string, NoteFieldDefinition[]> = {
  soap: [
    { key: 'subjective', label: 'S - 主观资料', placeholder: '来访者自述的感受、想法、问题...', required: true, order: 1 },
    { key: 'objective', label: 'O - 客观资料', placeholder: '咨询师观察到的行为、表情、非语言信息...', required: true, order: 2 },
    { key: 'assessment', label: 'A - 评估分析', placeholder: '临床评估、诊断印象、问题分析...', required: true, order: 3 },
    { key: 'plan', label: 'P - 计划', placeholder: '下一步治疗计划、作业、随访安排...', required: true, order: 4 },
  ],
  dap: [
    { key: 'data', label: 'D - 资料', placeholder: '主客观信息合并：来访者陈述 + 咨询师观察...', required: true, order: 1 },
    { key: 'assessment', label: 'A - 评估', placeholder: '临床评估与分析...', required: true, order: 2 },
    { key: 'plan', label: 'P - 计划', placeholder: '治疗计划与下一步安排...', required: true, order: 3 },
  ],
  birp: [
    { key: 'behavior', label: 'B - 行为', placeholder: '来访者在会谈中的行为表现...', required: true, order: 1 },
    { key: 'intervention', label: 'I - 干预', placeholder: '咨询师使用的干预技术和方法...', required: true, order: 2 },
    { key: 'response', label: 'R - 反应', placeholder: '来访者对干预的反应和回应...', required: true, order: 3 },
    { key: 'plan', label: 'P - 计划', placeholder: '后续计划和安排...', required: true, order: 4 },
  ],
};

export function SessionNoteForm({ episodeId, clientId, appointmentId, chiefComplaint, onDone }: Props) {
  const createNote = useCreateSessionNote();
  const { data: templates, isLoading: templatesLoading } = useNoteTemplates();
  const { toast } = useToast();

  const [format, setFormat] = useState('soap');
  const [selectedTemplate, setSelectedTemplate] = useState<NoteTemplate | null>(null);
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [duration, setDuration] = useState(50);
  const [sessionType, setSessionType] = useState('offline');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const [highlightField, setHighlightField] = useState<string | undefined>();

  const fieldDefinitions: NoteFieldDefinition[] = useMemo(() => {
    if (selectedTemplate && !selectedTemplate.id.startsWith('__')) return selectedTemplate.fieldDefinitions;
    return BUILTIN_FIELDS[format] || BUILTIN_FIELDS.soap;
  }, [format, selectedTemplate]);

  const handleFormatChange = (newFormat: string, template?: NoteTemplate) => {
    if (Object.values(fields).some((v) => v?.trim())) {
      if (!confirm('切换格式将清空已填写的内容，确定吗？')) return;
    }
    setFormat(newFormat);
    setSelectedTemplate(template || null);
    setFields({});
  };

  const handleAcceptSuggestion = (field: string, content: string) => {
    setFields({ ...fields, [field]: content });
    setHighlightField(field);
    setTimeout(() => setHighlightField(undefined), 2000);
  };

  const handleAcceptAll = (allFields: Record<string, string>, sum: string) => {
    setFields(allFields);
    if (sum) setSummary(sum);
    toast('AI 已填充全部字段，请审阅并修改', 'success');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createNote.mutateAsync({
        careEpisodeId: episodeId,
        appointmentId: appointmentId || undefined,
        clientId,
        noteFormat: format,
        templateId: selectedTemplate && !selectedTemplate.id.startsWith('__') ? selectedTemplate.id : undefined,
        sessionDate,
        duration,
        sessionType,
        summary: summary || undefined,
        subjective: format === 'soap' ? fields.subjective : undefined,
        objective: format === 'soap' ? fields.objective : undefined,
        assessment: format === 'soap' ? fields.assessment : undefined,
        plan: format === 'soap' ? fields.plan : undefined,
        fields: format !== 'soap' ? fields : undefined,
      });
      toast('笔记已保存', 'success');
      onDone();
    } catch {
      toast('保存失败', 'error');
    }
  };

  if (templatesLoading) return <PageLoading />;

  return (
    <div className="space-y-4">
      {/* Format selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <NoteFormatSelector value={format} onChange={handleFormatChange} templates={templates || []} />
      </div>

      {/* AI Guidance Chat */}
      <NoteGuidanceChat
        format={format}
        fieldDefinitions={fieldDefinitions}
        currentFields={fields}
        clientContext={{ chiefComplaint }}
        onAcceptSuggestion={handleAcceptSuggestion}
        onAcceptAll={handleAcceptAll}
      />

      {/* Note form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        {/* Metadata */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">日期</label>
            <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">时长（分钟）</label>
            <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">类型</label>
            <select value={sessionType} onChange={(e) => setSessionType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="offline">线下</option>
              <option value="online">线上</option>
              <option value="phone">电话</option>
            </select>
          </div>
        </div>

        {/* Dynamic fields */}
        <DynamicNoteFields
          fieldDefinitions={fieldDefinitions}
          values={fields}
          onChange={(key, value) => setFields({ ...fields, [key]: value })}
          highlightField={highlightField}
        />

        {/* Summary */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">会谈摘要</label>
          <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="一句话概括本次会谈"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onDone} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
          <button type="submit" disabled={createNote.isPending}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50">
            {createNote.isPending ? '保存中...' : '保存笔记'}
          </button>
        </div>
      </form>
    </div>
  );
}

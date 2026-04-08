import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Edit3, Trash2, Save, Sparkles, Send, Loader2, Plus, X,
  GripVertical,
} from 'lucide-react';
import type { NoteFieldDefinition } from '@psynote/shared';
import {
  useNoteTemplates, useUpdateNoteTemplate, useDeleteNoteTemplate,
} from '../../../api/useCounseling';
import { useCreateNoteTemplateChat } from '../../../api/useAI';
import { PageLoading, useToast } from '../../../shared/components';

const FORMAT_LABELS: Record<string, string> = {
  soap: 'SOAP',
  dap: 'DAP',
  birp: 'BIRP',
  custom: '自定义',
};

interface FieldEdit {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
}

interface EditState {
  title: string;
  format: string;
  fields: FieldEdit[];
}

function templateToEditState(t: any): EditState {
  return {
    title: t.title || '',
    format: t.format || 'custom',
    fields: ((t.fieldDefinitions || []) as NoteFieldDefinition[]).map((f) => ({
      key: f.key || '',
      label: f.label || '',
      placeholder: f.placeholder || '',
      required: !!f.required,
    })),
  };
}

interface Props {
  templateId: string;
  onBack: () => void;
  initialEditing?: boolean;
}

export function NoteTemplateDetail({ templateId, onBack, initialEditing = false }: Props) {
  const { data: templates } = useNoteTemplates();
  const updateTemplate = useUpdateNoteTemplate();
  const deleteTemplate = useDeleteNoteTemplate();
  const { toast } = useToast();

  const template = templates?.find((t: any) => t.id === templateId);
  const [editing, setEditing] = useState(initialEditing);
  const [editData, setEditData] = useState<EditState | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (initialEditing && template && !editData) {
      setEditData(templateToEditState(template));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditing, template]);

  const handleEdit = useCallback(() => {
    if (!template) return;
    setEditData(templateToEditState(template));
    setEditing(true);
  }, [template]);

  const handleCancel = () => {
    setEditing(false);
    setEditData(null);
  };

  const handleSave = async () => {
    if (!editData || !template) return;
    if (!editData.title.trim()) {
      toast('请填写模板名称', 'error');
      return;
    }
    const validFields = editData.fields.filter((f) => f.key && f.label);
    if (validFields.length === 0) {
      toast('至少需要一个有效字段（key 和 label 都不能为空）', 'error');
      return;
    }
    try {
      await updateTemplate.mutateAsync({
        templateId,
        title: editData.title,
        format: editData.format,
        fieldDefinitions: validFields.map((f, i) => ({ ...f, order: i + 1 })),
      });
      toast('笔记模板已保存', 'success');
      setEditing(false);
      setEditData(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    }
  };

  const handleDelete = async () => {
    if (!template) return;
    if (!confirm(`确定删除"${template.title}"？`)) return;
    try {
      await deleteTemplate.mutateAsync(templateId);
      toast('已删除', 'success');
      onBack();
    } catch {
      toast('删除失败', 'error');
    }
  };

  // Field updaters
  const updateField = useCallback((idx: number, patch: Partial<FieldEdit>) => {
    setEditData((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      fields[idx] = { ...fields[idx], ...patch };
      return { ...prev, fields };
    });
  }, []);

  const addField = useCallback(() => {
    setEditData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fields: [...prev.fields, { key: '', label: '', placeholder: '', required: false }],
      };
    });
  }, []);

  const removeField = useCallback((idx: number) => {
    setEditData((prev) => {
      if (!prev) return prev;
      return { ...prev, fields: prev.fields.filter((_, i) => i !== idx) };
    });
  }, []);

  const moveField = useCallback((from: number, to: number) => {
    if (from === to) return;
    setEditData((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      const [moved] = fields.splice(from, 1);
      fields.splice(to, 0, moved);
      return { ...prev, fields };
    });
  }, []);

  // AI: apply changes from chat
  const applyAIChange = useCallback((newState: Partial<EditState>) => {
    setEditData((prev) => (prev ? { ...prev, ...newState } : prev));
    toast('AI 已更新模板', 'success');
  }, [toast]);

  if (!template) return <PageLoading text="加载笔记模板..." />;

  const data: EditState = editing && editData ? editData : templateToEditState(template);

  return (
    <div className="flex -m-6" style={{ height: 'calc(100vh - 5rem)' }}>
      {/* LEFT: Content */}
      <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
          <h2 className="text-sm font-semibold text-slate-900 truncate">{data.title || '未命名'}</h2>

          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateTemplate.isPending || !editData}
                  className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {updateTemplate.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" /> 保存
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                  {FORMAT_LABELS[data.format] || data.format}
                </span>
                <button
                  onClick={handleEdit}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" /> 编辑
                </button>
                {template.orgId && (
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 删除
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-6 space-y-4">
            {/* Template info */}
            <CardSection title="模板信息">
              <Field label="模板名称" required>
                {editing ? (
                  <input
                    value={data.title}
                    onChange={(e) =>
                      setEditData((p) => (p ? { ...p, title: e.target.value } : p))
                    }
                    placeholder="如：初次评估记录"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                ) : (
                  <p className="text-sm text-slate-700">
                    {data.title || <span className="text-slate-300 italic">未命名</span>}
                  </p>
                )}
              </Field>

              <Field label="格式类型">
                {editing ? (
                  <select
                    value={data.format}
                    onChange={(e) =>
                      setEditData((p) => (p ? { ...p, format: e.target.value } : p))
                    }
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    {Object.entries(FORMAT_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-slate-700">{FORMAT_LABELS[data.format] || data.format}</p>
                )}
              </Field>
            </CardSection>

            {/* Field definitions */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">
                  字段定义 <span className="text-xs text-slate-400 font-normal">({data.fields.length})</span>
                </h3>
                {editing && (
                  <button
                    onClick={addField}
                    className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> 添加字段
                  </button>
                )}
              </div>

              {data.fields.length === 0 ? (
                <p className="text-center text-sm text-slate-300 italic py-8">
                  {editing ? '点击右上角添加字段' : '未定义字段'}
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.fields.map((f, i) => (
                    <FieldRow
                      key={i}
                      index={i}
                      field={f}
                      editing={editing}
                      isDragged={draggedIdx === i}
                      onUpdate={(patch) => updateField(i, patch)}
                      onRemove={() => removeField(i)}
                      onDragStart={() => setDraggedIdx(i)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggedIdx !== null && draggedIdx !== i) {
                          moveField(draggedIdx, i);
                          setDraggedIdx(i);
                        }
                      }}
                      onDragEnd={() => setDraggedIdx(null)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: AI Chat panel */}
      <div className="w-[420px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-slate-900 truncate">{data.title || '笔记模板'}</h3>
        </div>

        <NoteTemplateAIChatPanel
          editing={editing}
          currentState={data}
          onApply={applyAIChange}
        />
      </div>
    </div>
  );
}

function FieldRow({
  index,
  field,
  editing,
  isDragged,
  onUpdate,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  index: number;
  field: FieldEdit;
  editing: boolean;
  isDragged: boolean;
  onUpdate: (patch: Partial<FieldEdit>) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  if (!editing) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-slate-400 w-6 text-right shrink-0">{index + 1}.</span>
          <span className="text-sm font-medium text-slate-900">{field.label}</span>
          <span className="text-xs font-mono text-slate-400">{field.key}</span>
          {field.required && (
            <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-500 rounded">必填</span>
          )}
        </div>
        {field.placeholder && (
          <p className="text-xs text-slate-500 mt-1 ml-8">输入提示: {field.placeholder}</p>
        )}
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`px-3 py-3 flex items-center gap-2 transition ${
        isDragged ? 'opacity-50 bg-slate-50' : ''
      }`}
    >
      <button className="cursor-grab text-slate-300 hover:text-slate-500" title="拖拽排序">
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="text-xs text-slate-400 w-6 text-right shrink-0">{index + 1}.</span>
      <input
        value={field.key}
        onChange={(e) => onUpdate({ key: e.target.value })}
        placeholder="键名 (英文)"
        className="w-28 px-2 py-1.5 border border-slate-200 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <input
        value={field.label}
        onChange={(e) => onUpdate({ label: e.target.value })}
        placeholder="标签"
        className="w-28 px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <input
        value={field.placeholder}
        onChange={(e) => onUpdate({ placeholder: e.target.value })}
        placeholder="输入提示"
        className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <label className="flex items-center gap-1 text-xs text-slate-500">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onUpdate({ required: e.target.checked })}
          className="rounded border-slate-300"
        />
        必填
      </label>
      <button
        onClick={onRemove}
        className="text-slate-300 hover:text-red-500"
        title="删除字段"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400 font-medium block mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─── AI Chat Panel ───────────────────────────────────────────

type ChatMsg = { role: 'user' | 'assistant'; content: string };

function NoteTemplateAIChatPanel({
  editing,
  currentState,
  onApply,
}: {
  editing: boolean;
  currentState: EditState;
  onApply: (newState: Partial<EditState>) => void;
}) {
  const chatMutation = useCreateNoteTemplateChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        '我可以帮你修改和完善这个笔记模板。\n\n比如你可以说：\n• "添加一个『风险评估』字段"\n• "把 SOAP 改成 DAP 格式"\n• "去掉所有非必填字段"',
    },
  ]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!editing) return;
    const text = input.trim();
    if (!text || chatMutation.isPending) return;
    setInput('');

    const userMsg: ChatMsg = { role: 'user', content: text };
    setMessages((p) => [...p, userMsg]);

    const contextMsg = {
      role: 'user' as const,
      content: `当前笔记模板的结构如下，请基于这个结构进行修改：\n\n${JSON.stringify(
        {
          title: currentState.title,
          format: currentState.format,
          fieldDefinitions: currentState.fields,
        },
        null,
        2,
      )}`,
    };

    const apiMessages = [contextMsg, ...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    chatMutation.mutate(
      { messages: apiMessages },
      {
        onSuccess: (data) => {
          if (data.type === 'template') {
            const t = data.template;
            onApply({
              title: t.title || currentState.title,
              format: t.format || currentState.format,
              fields: (t.fieldDefinitions || []).map((f) => ({
                key: f.key || '',
                label: f.label || '',
                placeholder: f.placeholder || '',
                required: !!f.required,
              })),
            });
            setMessages((p) => [
              ...p,
              { role: 'assistant', content: data.summary || '已根据你的描述更新模板，左侧已刷新。' },
            ]);
          } else {
            setMessages((p) => [...p, { role: 'assistant', content: data.content }]);
          }
        },
        onError: (err) => {
          setMessages((p) => [
            ...p,
            {
              role: 'assistant',
              content: err instanceof Error ? `修改失败：${err.message}` : '修改失败，请重试',
            },
          ]);
        },
      },
    );
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-white">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-slate-900">AI 助手</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 relative">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[92%] rounded-2xl px-3.5 py-2 text-xs ${
                msg.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-md'
                  : 'bg-white text-slate-700 rounded-bl-md border border-slate-200'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-md px-3.5 py-2 text-xs text-slate-500 flex items-center gap-1.5 border border-slate-200">
              <Loader2 className="w-3 h-3 animate-spin" /> AI 思考中...
            </div>
          </div>
        )}

        {!editing && (
          <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 max-w-[85%] text-center shadow-sm">
              点击右上角「编辑」按钮，进入编辑态后即可与 AI 对话修改模板
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-200 bg-white">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())
            }
            placeholder={editing ? '输入修改意见...' : '请先点击编辑'}
            disabled={!editing || chatMutation.isPending}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!editing || chatMutation.isPending || !input.trim()}
            className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

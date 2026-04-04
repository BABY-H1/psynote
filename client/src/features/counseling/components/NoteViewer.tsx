import React, { useState } from 'react';
import { useUpdateSessionNote } from '../../../api/useCounseling';
import { useToast } from '../../../shared/components';
import { X, Save, Edit3 } from 'lucide-react';
import type { SessionNote } from '@psynote/shared';

interface Props {
  note: SessionNote;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}

export function NoteViewer({ note, editing, onEdit, onClose }: Props) {
  const updateNote = useUpdateSessionNote();
  const { toast } = useToast();
  const [fields, setFields] = useState<Record<string, string>>(() => {
    if (note.noteFormat === 'soap' || !note.noteFormat) {
      return {
        subjective: note.subjective || '',
        objective: note.objective || '',
        assessment: note.assessment || '',
        plan: note.plan || '',
      };
    }
    return (note.fields as Record<string, string>) || {};
  });

  const handleSave = async () => {
    try {
      const data: any = {};
      if (note.noteFormat === 'soap' || !note.noteFormat) {
        data.subjective = fields.subjective;
        data.objective = fields.objective;
        data.assessment = fields.assessment;
        data.plan = fields.plan;
      } else {
        data.fields = fields;
      }
      await updateNote.mutateAsync({ noteId: note.id, ...data });
      toast('笔记已更新', 'success');
      onClose();
    } catch {
      toast('更新失败', 'error');
    }
  };

  const formatLabel = (note.noteFormat || 'soap').toUpperCase();
  const fieldDefs = note.noteFormat === 'dap'
    ? [{ key: 'data', label: 'D - ��料' }, { key: 'assessment', label: 'A - 评估' }, { key: 'plan', label: 'P - 计划' }]
    : note.noteFormat === 'birp'
    ? [{ key: 'behavior', label: 'B - 行为' }, { key: 'intervention', label: 'I - 干预' }, { key: 'response', label: 'R - 反应' }, { key: 'plan', label: 'P - 计划' }]
    : [{ key: 'subjective', label: 'S - 主观资料' }, { key: 'objective', label: 'O - 客观资料' }, { key: 'assessment', label: 'A - 评估分析' }, { key: 'plan', label: 'P - 计划' }];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{formatLabel} 记录</span>
          <span className="text-xs text-slate-400">{note.sessionDate}</span>
          {note.duration && <span className="text-xs text-slate-400">{note.duration}分钟</span>}
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <button onClick={onEdit} className="flex items-center gap-1 px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 rounded">
              <Edit3 className="w-3 h-3" /> 编辑
            </button>
          )}
          {editing && (
            <button onClick={handleSave} disabled={updateNote.isPending}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-brand-600 text-white rounded hover:bg-brand-500 disabled:opacity-50">
              <Save className="w-3 h-3" /> {updateNote.isPending ? '保存中...' : '保存'}
            </button>
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {note.summary && (
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">摘要</div>
            <div className="text-sm text-slate-700">{note.summary}</div>
          </div>
        )}

        {fieldDefs.map((fd) => (
          <div key={fd.key}>
            <label className="block text-xs font-medium text-slate-500 mb-1">{fd.label}</label>
            {editing ? (
              <textarea
                value={fields[fd.key] || ''}
                onChange={(e) => setFields({ ...fields, [fd.key]: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            ) : (
              <div className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 min-h-[3rem]">
                {fields[fd.key] || <span className="text-slate-400">未填写</span>}
              </div>
            )}
          </div>
        ))}

        {note.tags && (note.tags as string[]).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(note.tags as string[]).map((tag) => (
              <span key={tag} className="px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full text-xs">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

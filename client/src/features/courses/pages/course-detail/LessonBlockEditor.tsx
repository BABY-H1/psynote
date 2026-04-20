import { LESSON_BLOCK_LABELS, type LessonBlockType } from '@psynote/shared';

/**
 * Single lesson-block row inside the chapter detail view. Monospace
 * textarea in edit mode; whitespace-pre-wrap paragraph in read mode;
 * a slate-300 "未填写" placeholder for empty read.
 */
export function LessonBlockEditor({
  blockType,
  value,
  editing,
  onChange,
}: {
  blockType: LessonBlockType;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
}) {
  const label = LESSON_BLOCK_LABELS[blockType];

  return (
    <div className="p-4">
      <label className="text-xs text-slate-500 font-semibold block mb-2">{label}</label>
      {editing ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          placeholder={`在此编辑「${label}」内容，或在左侧 AI 助手中描述你想要的修改...`}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-y font-mono"
        />
      ) : value ? (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-xs text-slate-300 italic">未填写</p>
      )}
    </div>
  );
}

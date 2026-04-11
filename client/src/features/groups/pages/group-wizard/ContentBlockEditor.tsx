/**
 * Inline content block editor for group session wizard.
 * Shows existing blocks from the scheme session and allows adding/deleting.
 * Content blocks are stored at the scheme level (shared across instances).
 */
import React, { useState } from 'react';
import {
  useContentBlocks,
  useCreateContentBlock,
  useDeleteContentBlock,
} from '../../../../api/useContentBlocks';
import {
  CONTENT_BLOCK_LABELS,
  CONTENT_BLOCK_DESCRIPTIONS,
  emptyPayload,
  type ContentBlockType,
  type GroupSessionBlock,
} from '@psynote/shared';
import {
  Plus, Trash2, X, FileText, Video, Music, File, CheckSquare,
  MessageSquare, Clipboard, Smile, AlertCircle,
} from 'lucide-react';

const BLOCK_ICONS: Record<ContentBlockType, React.ReactNode> = {
  video: <Video className="w-3.5 h-3.5" />,
  audio: <Music className="w-3.5 h-3.5" />,
  rich_text: <FileText className="w-3.5 h-3.5" />,
  pdf: <File className="w-3.5 h-3.5" />,
  quiz: <CheckSquare className="w-3.5 h-3.5" />,
  reflection: <MessageSquare className="w-3.5 h-3.5" />,
  worksheet: <Clipboard className="w-3.5 h-3.5" />,
  check_in: <Smile className="w-3.5 h-3.5" />,
};

const ALL_BLOCK_TYPES: ContentBlockType[] = [
  'rich_text', 'reflection', 'worksheet', 'video', 'audio', 'pdf', 'quiz', 'check_in',
];

interface Props {
  schemeSessionId: string;
}

function getBlockSummary(block: GroupSessionBlock): string {
  const payload = block.payload as Record<string, unknown>;
  switch (block.blockType) {
    case 'rich_text': return (payload?.body as string)?.slice(0, 40) || '图文内容';
    case 'reflection': return (payload?.prompt as string)?.slice(0, 40) || '反思问题';
    case 'worksheet': return `${((payload?.fields as unknown[]) || []).length} 个字段`;
    case 'video': return (payload?.src as string) || '视频';
    case 'audio': return (payload?.src as string) || '音频';
    case 'pdf': return (payload?.src as string) || '文档';
    case 'quiz': return `${((payload?.questions as unknown[]) || []).length} 题`;
    case 'check_in': return (payload?.prompt as string)?.slice(0, 40) || '打卡';
    default: return '';
  }
}

export function ContentBlockEditor({ schemeSessionId }: Props) {
  const { data: blocks, isLoading } = useContentBlocks('group', schemeSessionId);
  const createBlock = useCreateContentBlock();
  const deleteBlock = useDeleteContentBlock();
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [editingType, setEditingType] = useState<ContentBlockType | null>(null);
  const [editPayload, setEditPayload] = useState<Record<string, unknown>>({});

  const handleSelectType = (type: ContentBlockType) => {
    setEditingType(type);
    setEditPayload(emptyPayload(type) as Record<string, unknown>);
    setShowTypePicker(false);
  };

  const handleSaveBlock = async () => {
    if (!editingType) return;
    try {
      await createBlock.mutateAsync({
        parentType: 'group',
        parentId: schemeSessionId,
        blockType: editingType,
        payload: editPayload,
        sortOrder: (blocks?.length || 0) + 1,
      });
      setEditingType(null);
      setEditPayload({});
    } catch {
      // silent
    }
  };

  const handleDelete = async (blockId: string) => {
    try {
      await deleteBlock.mutateAsync({ blockId, parentType: 'group' });
    } catch {
      // silent
    }
  };

  return (
    <div className="px-5 py-4 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-xs font-medium text-emerald-600">活动内容</span>
          <span className="text-xs text-slate-400">（C端可见）</span>
        </div>
      </div>

      {/* Block list */}
      {isLoading ? (
        <div className="text-xs text-slate-400 py-2">加载中...</div>
      ) : (blocks && blocks.length > 0) ? (
        <div className="space-y-1.5 mb-3">
          {blocks.map((block) => (
            <div key={block.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg group">
              <span className="text-slate-500">{BLOCK_ICONS[block.blockType as ContentBlockType]}</span>
              <span className="text-xs font-medium text-slate-700">
                {CONTENT_BLOCK_LABELS[block.blockType as ContentBlockType]}
              </span>
              <span className="text-xs text-slate-400 truncate flex-1">
                {getBlockSummary(block as GroupSessionBlock)}
              </span>
              <button
                onClick={() => handleDelete(block.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-400 py-2 mb-2">暂无活动内容</div>
      )}

      {/* Type picker */}
      {showTypePicker && !editingType && (
        <div className="grid grid-cols-4 gap-2 mb-3 p-3 bg-slate-50 rounded-lg">
          {ALL_BLOCK_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => handleSelectType(type)}
              className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-white hover:shadow-sm transition text-center"
            >
              <span className="text-slate-500">{BLOCK_ICONS[type]}</span>
              <span className="text-xs font-medium text-slate-700">{CONTENT_BLOCK_LABELS[type]}</span>
              <span className="text-[10px] text-slate-400 leading-tight">{CONTENT_BLOCK_DESCRIPTIONS[type]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Inline editor for selected type */}
      {editingType && (
        <div className="p-3 bg-emerald-50 rounded-lg space-y-3 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-700">
              添加{CONTENT_BLOCK_LABELS[editingType]}
            </span>
            <button onClick={() => { setEditingType(null); setEditPayload({}); }}
              className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <BlockPayloadForm
            blockType={editingType}
            payload={editPayload}
            onChange={setEditPayload}
          />

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setEditingType(null); setEditPayload({}); }}
              className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-white">
              取消
            </button>
            <button onClick={handleSaveBlock} disabled={createBlock.isPending}
              className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50">
              {createBlock.isPending ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {/* Add button */}
      {!editingType && (
        <button
          onClick={() => setShowTypePicker(!showTypePicker)}
          className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
        >
          <Plus className="w-3.5 h-3.5" /> 添加内容
        </button>
      )}

      {/* Homework hint */}
      <div className="mt-3 flex items-start gap-2 text-xs text-slate-400">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          添加"反思"或"工作表"类型作为课后任务，来访者可在客户端提交。
          活动内容修改将同步到使用此方案的所有活动。
        </span>
      </div>
    </div>
  );
}

/** Simple payload editor per block type */
function BlockPayloadForm({ blockType, payload, onChange }: {
  blockType: ContentBlockType;
  payload: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  switch (blockType) {
    case 'rich_text':
      return (
        <div>
          <label className="block text-xs text-slate-500 mb-1">内容</label>
          <textarea
            value={(payload.body as string) || ''}
            onChange={(e) => onChange({ ...payload, body: e.target.value })}
            rows={4}
            placeholder="输入图文内容（支持 Markdown）..."
            className={inputCls}
          />
        </div>
      );

    case 'reflection':
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">反思问题</label>
            <textarea
              value={(payload.prompt as string) || ''}
              onChange={(e) => onChange({ ...payload, prompt: e.target.value })}
              rows={2}
              placeholder="如：回顾本次活动，你最大的收获是什么？"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">最少字数</label>
            <input
              type="number"
              value={(payload.minLength as number) || 50}
              onChange={(e) => onChange({ ...payload, minLength: Number(e.target.value) })}
              min={0}
              className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
        </div>
      );

    case 'worksheet':
      return (
        <div>
          <label className="block text-xs text-slate-500 mb-1">表单说明</label>
          <textarea
            value={(payload.instruction as string) || ''}
            onChange={(e) => onChange({ ...payload, instruction: e.target.value })}
            rows={2}
            placeholder="如：请完成以下 ABC 思维记录表"
            className={inputCls}
          />
          <p className="text-xs text-slate-400 mt-1">完整表单字段可在发布后详情页中编辑</p>
        </div>
      );

    case 'video':
    case 'audio':
      return (
        <div>
          <label className="block text-xs text-slate-500 mb-1">
            {blockType === 'video' ? '视频链接' : '音频链接'}
          </label>
          <input
            value={(payload.src as string) || ''}
            onChange={(e) => onChange({ ...payload, src: e.target.value })}
            placeholder="粘贴链接地址..."
            className={inputCls}
          />
        </div>
      );

    case 'pdf':
      return (
        <div>
          <label className="block text-xs text-slate-500 mb-1">文档链接</label>
          <input
            value={(payload.src as string) || ''}
            onChange={(e) => onChange({ ...payload, src: e.target.value })}
            placeholder="粘贴 PDF 链接..."
            className={inputCls}
          />
        </div>
      );

    case 'quiz':
      return (
        <div>
          <p className="text-xs text-slate-400">选择题的详细设置可在发布后详情页中编辑</p>
        </div>
      );

    case 'check_in':
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">打卡问题</label>
            <input
              value={(payload.prompt as string) || ''}
              onChange={(e) => onChange({ ...payload, prompt: e.target.value })}
              placeholder="如：今天的心情如何？"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">类型</label>
            <select
              value={(payload.kind as string) || 'mood'}
              onChange={(e) => onChange({ ...payload, kind: e.target.value })}
              className={inputCls}
            >
              <option value="mood">心情 (1-5)</option>
              <option value="scale">量尺 (自定义范围)</option>
              <option value="text">文字</option>
            </select>
          </div>
        </div>
      );

    default:
      return null;
  }
}

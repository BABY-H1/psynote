/**
 * Phase 9α — Content Block Panel
 *
 * A composable editor that shows a list of content blocks attached to a
 * "parent" (either a course chapter or a group scheme session), and lets a
 * counselor add, edit, reorder, and delete them.
 *
 * Design notes:
 * - Blocks are kept ordered by `sortOrder` (returned already sorted by the API).
 * - Each block type has its own small editor component in ./editors/
 * - We optimistically update local state then call server mutations, so the
 *   UI feels responsive even when the user rearranges or edits in bulk.
 */
import React, { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronUp, Trash2, Plus, Eye, EyeOff,
  Video, Music, FileText, File as FileIcon, CheckSquare,
  MessageSquare, Clipboard, Smile,
} from 'lucide-react';
import {
  CONTENT_BLOCK_LABELS,
  CONTENT_BLOCK_DESCRIPTIONS,
  VISIBILITY_LABELS,
  emptyPayload,
  defaultBlockVisibility,
  type ContentBlockType,
  type BlockVisibility,
  type CourseContentBlock,
  type GroupSessionBlock,
} from '@psynote/shared';
import {
  useContentBlocks,
  useCreateContentBlock,
  useUpdateContentBlock,
  useDeleteContentBlock,
  useReorderContentBlocks,
} from '../../../../api/useContentBlocks';
import { useToast } from '../../../../shared/components';

import {
  VideoBlockEditor,
  AudioBlockEditor,
  RichTextBlockEditor,
  PdfBlockEditor,
  QuizBlockEditor,
  ReflectionBlockEditor,
  WorksheetBlockEditor,
  CheckInBlockEditor,
} from './editors';

interface Props {
  parentType: 'course' | 'group';
  parentId: string;
  /** Presentation mode — 'inline' for embedding inside a parent page, 'panel' for popover. */
  variant?: 'inline' | 'panel';
}

const BLOCK_ICONS: Record<ContentBlockType, React.ComponentType<{ className?: string }>> = {
  video: Video,
  audio: Music,
  rich_text: FileText,
  pdf: FileIcon,
  quiz: CheckSquare,
  reflection: MessageSquare,
  worksheet: Clipboard,
  check_in: Smile,
};

const ALL_BLOCK_TYPES: ContentBlockType[] = [
  'rich_text', 'video', 'audio', 'pdf', 'quiz', 'reflection', 'worksheet', 'check_in',
];

export function ContentBlockPanel({ parentType, parentId, variant = 'inline' }: Props) {
  const { data: blocks = [], isLoading } = useContentBlocks(parentType, parentId);
  const createBlock = useCreateContentBlock();
  const updateBlock = useUpdateContentBlock();
  const deleteBlock = useDeleteContentBlock();
  const reorderBlocks = useReorderContentBlocks();
  const { toast } = useToast();

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...blocks].sort((a, b) => a.sortOrder - b.sortOrder),
    [blocks],
  );

  async function handleAdd(blockType: ContentBlockType) {
    setAddMenuOpen(false);
    try {
      const newBlock = await createBlock.mutateAsync({
        parentType,
        parentId,
        blockType,
        visibility: defaultBlockVisibility(parentType),
        sortOrder: sorted.length,
        payload: emptyPayload(blockType),
      });
      setExpandedId(newBlock.id);
      toast(`已添加「${CONTENT_BLOCK_LABELS[blockType]}」`, 'success');
    } catch (err: any) {
      toast(err?.message ?? '添加失败', 'error');
    }
  }

  async function handlePayloadChange(blockId: string, payload: unknown) {
    try {
      await updateBlock.mutateAsync({ blockId, parentType, payload });
    } catch (err: any) {
      toast(err?.message ?? '保存失败', 'error');
    }
  }

  async function handleVisibilityChange(blockId: string, visibility: BlockVisibility) {
    try {
      await updateBlock.mutateAsync({ blockId, parentType, visibility });
    } catch (err: any) {
      toast(err?.message ?? '保存失败', 'error');
    }
  }

  async function handleDelete(blockId: string) {
    if (!window.confirm('确定删除该内容块？')) return;
    try {
      await deleteBlock.mutateAsync({ blockId, parentType });
      toast('已删除', 'success');
    } catch (err: any) {
      toast(err?.message ?? '删除失败', 'error');
    }
  }

  async function handleMove(blockId: string, direction: 'up' | 'down') {
    const idx = sorted.findIndex((b) => b.id === blockId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const newOrder = [...sorted];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    try {
      await reorderBlocks.mutateAsync({
        parentType,
        parentId,
        orderedIds: newOrder.map((b) => b.id),
      });
    } catch (err: any) {
      toast(err?.message ?? '排序失败', 'error');
    }
  }

  if (isLoading) {
    return <div className="text-sm text-gray-500 py-4">加载中…</div>;
  }

  return (
    <div className={variant === 'inline' ? 'space-y-3' : 'space-y-3 p-4 bg-white rounded-lg shadow'}>
      {sorted.length === 0 && (
        <div className="text-sm text-gray-500 py-3 px-4 bg-gray-50 rounded-md">
          还没有学员可消费的内容。点击下方「添加内容块」开始。
        </div>
      )}

      {sorted.map((block, idx) => (
        <BlockCard
          key={block.id}
          block={block as CourseContentBlock | GroupSessionBlock}
          parentType={parentType}
          isFirst={idx === 0}
          isLast={idx === sorted.length - 1}
          isExpanded={expandedId === block.id}
          onToggleExpand={() => setExpandedId((id) => (id === block.id ? null : block.id))}
          onPayloadChange={(payload) => handlePayloadChange(block.id, payload)}
          onVisibilityChange={(v) => handleVisibilityChange(block.id, v)}
          onDelete={() => handleDelete(block.id)}
          onMoveUp={() => handleMove(block.id, 'up')}
          onMoveDown={() => handleMove(block.id, 'down')}
        />
      ))}

      {/* Add-block button with popover menu */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setAddMenuOpen((v) => !v)}
          className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          添加内容块
        </button>

        {addMenuOpen && (
          <div className="absolute left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-10 grid grid-cols-2 gap-1">
            {ALL_BLOCK_TYPES.map((type) => {
              const Icon = BLOCK_ICONS[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleAdd(type)}
                  className="flex items-start gap-2 p-2 text-left hover:bg-blue-50 rounded-md transition-colors"
                >
                  <Icon className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-gray-800">
                      {CONTENT_BLOCK_LABELS[type]}
                    </div>
                    <div className="text-xs text-gray-500">
                      {CONTENT_BLOCK_DESCRIPTIONS[type]}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface BlockCardProps {
  block: CourseContentBlock | GroupSessionBlock;
  parentType: 'course' | 'group';
  isFirst: boolean;
  isLast: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onPayloadChange: (payload: unknown) => void;
  onVisibilityChange: (v: BlockVisibility) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function BlockCard({
  block, parentType, isFirst, isLast, isExpanded,
  onToggleExpand, onPayloadChange, onVisibilityChange, onDelete, onMoveUp, onMoveDown,
}: BlockCardProps) {
  const Icon = BLOCK_ICONS[block.blockType];
  const VisibilityIcon = block.visibility === 'facilitator' ? EyeOff : Eye;

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <Icon className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <span className="text-sm font-medium text-gray-800 flex-1">
          {CONTENT_BLOCK_LABELS[block.blockType]}
        </span>

        {/* Visibility toggle — only meaningful for group sessions */}
        {parentType === 'group' && (
          <select
            value={block.visibility}
            onChange={(e) => onVisibilityChange(e.target.value as BlockVisibility)}
            className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white"
            title={VISIBILITY_LABELS[block.visibility as BlockVisibility]}
          >
            <option value="participant">仅学员</option>
            <option value="facilitator">仅带组人</option>
            <option value="both">双方可见</option>
          </select>
        )}
        {parentType === 'course' && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <VisibilityIcon className="w-3 h-3" />
            {VISIBILITY_LABELS[block.visibility as BlockVisibility]}
          </span>
        )}

        <button type="button" onClick={onMoveUp} disabled={isFirst}
          className="p-1 hover:bg-gray-200 rounded disabled:opacity-30">
          <ChevronUp className="w-4 h-4" />
        </button>
        <button type="button" onClick={onMoveDown} disabled={isLast}
          className="p-1 hover:bg-gray-200 rounded disabled:opacity-30">
          <ChevronDown className="w-4 h-4" />
        </button>
        <button type="button" onClick={onDelete}
          className="p-1 hover:bg-red-100 text-red-600 rounded">
          <Trash2 className="w-4 h-4" />
        </button>
        <button type="button" onClick={onToggleExpand}
          className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
          {isExpanded ? '收起' : '编辑'}
        </button>
      </div>

      {isExpanded && (
        <div className="p-3">
          <BlockEditorSwitch
            blockType={block.blockType}
            payload={block.payload}
            onChange={onPayloadChange}
          />
        </div>
      )}
    </div>
  );
}

function BlockEditorSwitch({
  blockType,
  payload,
  onChange,
}: {
  blockType: ContentBlockType;
  payload: unknown;
  onChange: (payload: unknown) => void;
}) {
  switch (blockType) {
    case 'video':      return <VideoBlockEditor payload={payload as any} onChange={onChange} />;
    case 'audio':      return <AudioBlockEditor payload={payload as any} onChange={onChange} />;
    case 'rich_text':  return <RichTextBlockEditor payload={payload as any} onChange={onChange} />;
    case 'pdf':        return <PdfBlockEditor payload={payload as any} onChange={onChange} />;
    case 'quiz':       return <QuizBlockEditor payload={payload as any} onChange={onChange} />;
    case 'reflection': return <ReflectionBlockEditor payload={payload as any} onChange={onChange} />;
    case 'worksheet':  return <WorksheetBlockEditor payload={payload as any} onChange={onChange} />;
    case 'check_in':   return <CheckInBlockEditor payload={payload as any} onChange={onChange} />;
    default:           return <div className="text-sm text-gray-500">未知的内容块类型</div>;
  }
}

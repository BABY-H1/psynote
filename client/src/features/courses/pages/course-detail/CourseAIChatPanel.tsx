import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import type { CourseBlueprintData, LessonBlockType } from '@psynote/shared';
import {
  useRefineCourseBlueprint,
  useRefineLessonBlock,
} from '../../../../api/useCourseAuthoring';
import { BLOCK_GROUPS, type BlockGroupKey } from './types';

type ChatMsg = { role: 'user' | 'assistant'; content: string };

/**
 * Context-sensitive AI assistant: overview → refineCourseBlueprint
 * (replaces the whole blueprint); chapter → refineLessonBlock in
 * parallel across the active sub-group's blocks.
 */
export function CourseAIChatPanel({
  editing,
  blueprint,
  activeTab,
  activeBlockGroup,
  activeChapterId,
  chapterLessonBlocks,
  onApplyBlueprint,
  onApplyLessonBlock,
}: {
  editing: boolean;
  blueprint: CourseBlueprintData;
  activeTab: 'overview' | number;
  activeBlockGroup: BlockGroupKey;
  activeChapterId?: string;
  chapterLessonBlocks: Record<string, string>;
  onApplyBlueprint: (newBlueprint: CourseBlueprintData) => void;
  onApplyLessonBlock: (chapterId: string, blockType: LessonBlockType, content: string) => void;
}) {
  const refineBlueprint = useRefineCourseBlueprint();
  const refineBlock = useRefineLessonBlock();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        '我可以帮你修改和完善课程。\n\n• 选中「总」时，修改针对整体蓝图\n• 选中某一章节时，修改针对该章节及当前的教案部分（教学准备/课堂活动/课后延伸）',
    },
  ]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const isPending = refineBlueprint.isPending || refineBlock.isPending;
  const disabled = !editing;

  const contextHint = useMemo(() => {
    if (activeTab === 'overview') return '当前: 整体蓝图';
    const groupLabel = BLOCK_GROUPS.find((g) => g.key === activeBlockGroup)?.label || '';
    return `当前: 第 ${(activeTab as number) + 1} 节 · ${groupLabel}`;
  }, [activeTab, activeBlockGroup]);

  const handleSend = () => {
    if (disabled) return;
    const text = input.trim();
    if (!text || isPending) return;
    setInput('');
    setMessages((p) => [...p, { role: 'user', content: text }]);

    if (activeTab === 'overview') {
      refineBlueprint.mutate(
        { currentBlueprint: blueprint, instruction: text },
        {
          onSuccess: (data) => {
            onApplyBlueprint(data);
            setMessages((p) => [
              ...p,
              { role: 'assistant', content: `已更新蓝图（${data.sessions.length} 节），右侧已刷新。` },
            ]);
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
      return;
    }

    const sessionIndex = activeTab as number;
    if (!activeChapterId) {
      setMessages((p) => [...p, { role: 'assistant', content: '当前章节还没有内容，请先保存蓝图。' }]);
      return;
    }

    const groupBlocks = BLOCK_GROUPS.find((g) => g.key === activeBlockGroup)?.blocks || [];
    const calls = groupBlocks.map((blockType) => {
      const existing = chapterLessonBlocks[blockType] || '';
      return refineBlock
        .mutateAsync({ blockContent: existing, instruction: text, blueprint, sessionIndex })
        .then((res) => {
          if (res.content) onApplyLessonBlock(activeChapterId, blockType, res.content);
          return { blockType, ok: true as const };
        })
        .catch((err) => ({
          blockType,
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        }));
    });

    Promise.all(calls).then((results) => {
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      const groupLabel = BLOCK_GROUPS.find((g) => g.key === activeBlockGroup)?.label || '';
      setMessages((p) => [
        ...p,
        {
          role: 'assistant',
          content:
            failCount === 0
              ? `已更新「${groupLabel}」的 ${okCount} 个区块。`
              : `已更新 ${okCount} 个区块，${failCount} 个失败。`,
        },
      ]);
    });
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
        {isPending && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-md px-3.5 py-2 text-xs text-slate-500 flex items-center gap-1.5 border border-slate-200">
              <Loader2 className="w-3 h-3 animate-spin" /> AI 思考中...
            </div>
          </div>
        )}

        {disabled && (
          <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 max-w-[85%] text-center shadow-sm">
              点击右上角「编辑」按钮，进入编辑态后即可与 AI 对话修改课程
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-200 bg-white">
        <p className="text-xs text-slate-400 mb-1.5">{contextHint}</p>
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())
            }
            placeholder={disabled ? '请先点击编辑' : '输入修改意见...'}
            disabled={disabled || isPending}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={disabled || isPending || !input.trim()}
            className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

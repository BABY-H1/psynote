import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Loader2, Send, Sparkles } from 'lucide-react';
import type { CourseType, TargetAudience } from '@psynote/shared';
import { useCreateCourse } from '../../../api/useCourses';
import { useCreateCourseChat, type CreateCourseChatResponse } from '../../../api/useCourseAuthoring';
import { useToast } from '../../../shared/components';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  course?: Extract<CreateCourseChatResponse, { type: 'course' }>['course'];
};

interface Props {
  onClose: () => void;
  onCreated?: (courseId: string) => void;
}

const COURSE_TYPE_LABELS: Record<string, string> = {
  micro_course: '微课',
  series: '系列课',
  group_facilitation: '团辅课程',
  workshop: '工作坊',
};

const AUDIENCE_LABELS: Record<string, string> = {
  parent: '家长',
  student: '学生',
  counselor: '咨询师',
  teacher: '教师',
};

export function AICourseCreator({ onClose, onCreated }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatMutation = useCreateCourseChat();
  const createCourse = useCreateCourse();
  const [input, setInput] = useState('');
  const [savingDraftTitle, setSavingDraftTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        '你好，我来帮你一起创作课程。\n\n先告诉我两件事：\n1. 这门课主要面向谁？\n2. 你最想解决什么问题？',
    },
  ]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function appendAssistantMessage(content: string) {
    setMessages((prev) => [...prev, { role: 'assistant', content }]);
  }

  function handleSend() {
    const content = input.trim();
    if (!content || chatMutation.isPending) return;

    const nextMessages = [...messages, { role: 'user' as const, content }];
    setMessages(nextMessages);
    setInput('');

    const apiMessages = nextMessages
      .filter((message) => message.role === 'user' || (message.role === 'assistant' && !message.course))
      .map((message) => ({ role: message.role, content: message.content }));

    chatMutation.mutate(
      { messages: apiMessages },
      {
        onSuccess: (result) => {
          if (result.type === 'course') {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: result.summary || '我已经整理出一份课程草稿，你可以先预览，再进入蓝图继续编辑。',
                course: result.course,
              },
            ]);
            return;
          }

          appendAssistantMessage(result.content);
        },
        onError: (error) => {
          appendAssistantMessage(error instanceof Error ? error.message : 'AI 暂时不可用，请稍后再试。');
        },
      },
    );
  }

  async function handleSaveCourse(course: Extract<CreateCourseChatResponse, { type: 'course' }>['course']) {
    setSavingDraftTitle(course.title);

    try {
        const created = await createCourse.mutateAsync({
          title: course.title,
          description: course.description,
          category: course.category,
          courseType: course.courseType as CourseType | undefined,
          targetAudience: course.targetAudience as TargetAudience | undefined,
          creationMode: 'ai_assisted',
          status: 'blueprint',
        requirementsConfig: course.requirements,
        blueprintData: course.blueprint,
      });

      toast('课程草稿已创建，正在进入蓝图编辑', 'success');
      if (onCreated) {
        onCreated(created.id);
      } else {
        navigate(`/knowledge/courses/${created.id}/blueprint`);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '创建课程失败，请重试', 'error');
    } finally {
      setSavingDraftTitle(null);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] max-w-4xl w-full mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-bold text-slate-900">AI 生成课程</h3>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                message.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-md'
                  : 'bg-slate-100 text-slate-700 rounded-bl-md'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>

              {message.course && (
                <div className="mt-3 bg-white rounded-lg border border-amber-200 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-amber-700">
                    <BookOpen className="w-4 h-4" />
                    <span className="text-xs font-semibold">生成的课程草稿</span>
                  </div>
                  <div className="text-sm font-medium text-slate-900">{message.course.title}</div>
                  {message.course.description && (
                    <p className="text-xs text-slate-500">{message.course.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    {message.course.courseType && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100">
                        {COURSE_TYPE_LABELS[message.course.courseType] || message.course.courseType}
                      </span>
                    )}
                    {message.course.targetAudience && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100">
                        {AUDIENCE_LABELS[message.course.targetAudience] || message.course.targetAudience}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-slate-100">
                      {message.course.blueprint.sessions.length} 节
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    下一步会直接进入蓝图编辑，你可以继续细调每一节的结构和内容。
                  </div>
                  <button
                    onClick={() => handleSaveCourse(message.course!)}
                    disabled={savingDraftTitle === message.course.title}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-500 disabled:opacity-50"
                  >
                    {savingDraftTitle === message.course.title ? '创建中...' : '保存并进入蓝图编辑'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-slate-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              正在整理课程思路...
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="描述你想做的课程，比如对象、主题、目标..."
          disabled={chatMutation.isPending}
          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          onClick={handleSend}
          disabled={chatMutation.isPending || !input.trim()}
          className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

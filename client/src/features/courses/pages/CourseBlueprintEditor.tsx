import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CourseBlueprintData, CourseBlueprintSession } from '@psynote/shared';
import { useCourse, useUpdateCourse, useConfirmBlueprint } from '../../../api/useCourses';
import { useRefineCourseBlueprint } from '../../../api/useCourseAuthoring';
import { PageLoading, useToast } from '../../../shared/components';

interface CourseBlueprintEditorProps {
  courseId?: string;
  onBack?: () => void;
  onConfirmed?: (courseId: string, chapterId?: string) => void;
}

export function CourseBlueprintEditor({
  courseId: courseIdProp,
  onBack,
  onConfirmed,
}: CourseBlueprintEditorProps = {}) {
  const { courseId: routeCourseId } = useParams<{ courseId: string }>();
  const courseId = courseIdProp ?? routeCourseId;
  const navigate = useNavigate();
  const { data: course, isLoading } = useCourse(courseId);
  const updateCourse = useUpdateCourse();
  const confirmBlueprint = useConfirmBlueprint();
  const refineMutation = useRefineCourseBlueprint();
  const { toast } = useToast();

  const [blueprint, setBlueprint] = useState<CourseBlueprintData | null>(null);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);

  // Clone blueprint from course data when it loads
  useEffect(() => {
    if (course?.blueprintData && !blueprint) {
      setBlueprint(structuredClone(course.blueprintData));
    }
  }, [course, blueprint]);

  if (isLoading) {
    return <PageLoading />;
  }

  if (!blueprint) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">暂无蓝图数据</p>
      </div>
    );
  }

  const selectedSession: CourseBlueprintSession | undefined =
    blueprint.sessions[selectedSessionIndex];

  // ─── Field updaters ────────────────────────────────────────────

  function updateField<K extends keyof CourseBlueprintData>(
    key: K,
    value: CourseBlueprintData[K],
  ) {
    setBlueprint((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateSession(
    index: number,
    key: keyof CourseBlueprintSession,
    value: string,
  ) {
    setBlueprint((prev) => {
      if (!prev) return prev;
      const sessions = [...prev.sessions];
      sessions[index] = { ...sessions[index], [key]: value };
      return { ...prev, sessions };
    });
  }

  // ─── Refine helpers ────────────────────────────────────────────

  function handleRefine(instruction: string) {
    if (!blueprint) return;
    refineMutation.mutate(
      { currentBlueprint: blueprint, instruction },
      {
        onSuccess: (data) => {
          setBlueprint(data);
          toast('蓝图已更新', 'success');
        },
      },
    );
  }

  function handleConfirm() {
    if (!courseId || !blueprint) return;

    // Save the blueprint data first, then confirm
    updateCourse.mutate(
      { courseId, blueprintData: blueprint },
      {
        onSuccess: () => {
          confirmBlueprint.mutate(
            { courseId, sessions: blueprint.sessions },
            {
              onSuccess: (data: unknown) => {
                const chapters = data as any[];
                toast('蓝图已确认', 'success');
                if (onConfirmed) {
                  onConfirmed(courseId, chapters[0]?.id);
                } else if (chapters.length > 0) {
                  navigate(`/knowledge/courses/${courseId}/chapters/${chapters[0].id}/edit`);
                } else {
                  navigate('/knowledge/courses');
                }
              },
            },
          );
        },
      },
    );
  }

  const sessionNum = selectedSessionIndex + 1;

  const quickActions = [
    {
      label: '重新生成本节',
      instruction: `重新生成第${sessionNum}节的内容`,
    },
    {
      label: '调整难度',
      instruction: `降低第${sessionNum}节的难度，使其更容易理解`,
    },
    {
      label: '改为技能训练',
      instruction: `将第${sessionNum}节改为更偏重技能训练和实操练习`,
    },
    {
      label: '改为家长适用',
      instruction: `将第${sessionNum}节改为更适合焦虑型家长的表述`,
    },
  ];

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      {/* ── Top section ─────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <button
          onClick={() => (onBack ? onBack() : navigate('/knowledge/courses'))}
          className="text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          &larr; 返回课程列表
        </button>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              课程名称
            </label>
            <input
              type="text"
              value={blueprint.courseName}
              onChange={(e) => updateField('courseName', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              课程定位
            </label>
            <textarea
              rows={1}
              value={blueprint.positioning}
              onChange={(e) => updateField('positioning', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              适用对象
            </label>
            <input
              type="text"
              value={blueprint.targetDescription}
              onChange={(e) => updateField('targetDescription', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              适用边界
            </label>
            <input
              type="text"
              value={blueprint.boundaries}
              onChange={(e) => updateField('boundaries', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              课程目标
            </label>
            <textarea
              rows={1}
              value={blueprint.goals.join(', ')}
              onChange={(e) =>
                updateField(
                  'goals',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                )
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              转介建议
            </label>
            <input
              type="text"
              value={blueprint.referralAdvice ?? ''}
              onChange={(e) => updateField('referralAdvice', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
        </div>
      </div>

      {/* ── Split pane ──────────────────────────────────────────── */}
      <div className="flex gap-6">
        {/* Left panel: session tree */}
        <div className="w-1/3 bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            课节列表
          </h3>
          <ul className="space-y-1">
            {blueprint.sessions.map((session, idx) => (
              <li key={idx}>
                <button
                  onClick={() => setSelectedSessionIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    idx === selectedSessionIndex
                      ? 'bg-brand-50 border border-brand-500 border-l-4 font-medium text-brand-700'
                      : 'hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  {idx + 1}. {session.title}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Right panel: session details */}
        <div className="w-2/3 space-y-4">
          {/* Quick action buttons */}
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => handleRefine(action.instruction)}
                disabled={refineMutation.isPending}
                className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
              >
                {refineMutation.isPending ? '生成中...' : action.label}
              </button>
            ))}
          </div>

          {/* Session detail card */}
          {selectedSession && (
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  课节标题
                </label>
                <input
                  type="text"
                  value={selectedSession.title}
                  onChange={(e) =>
                    updateSession(selectedSessionIndex, 'title', e.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  课节目标
                </label>
                <textarea
                  rows={2}
                  value={selectedSession.goal}
                  onChange={(e) =>
                    updateSession(selectedSessionIndex, 'goal', e.target.value)
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  核心概念
                </label>
                <textarea
                  rows={3}
                  value={selectedSession.coreConcepts}
                  onChange={(e) =>
                    updateSession(
                      selectedSessionIndex,
                      'coreConcepts',
                      e.target.value,
                    )
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  互动建议
                </label>
                <textarea
                  rows={3}
                  value={selectedSession.interactionSuggestions}
                  onChange={(e) =>
                    updateSession(
                      selectedSessionIndex,
                      'interactionSuggestions',
                      e.target.value,
                    )
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  课后作业建议
                </label>
                <textarea
                  rows={3}
                  value={selectedSession.homeworkSuggestion}
                  onChange={(e) =>
                    updateSession(
                      selectedSessionIndex,
                      'homeworkSuggestion',
                      e.target.value,
                    )
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom action bar ───────────────────────────────────── */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => handleRefine('重新生成整个蓝图')}
          disabled={refineMutation.isPending}
          className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
        >
          {refineMutation.isPending ? '生成中...' : '全部重新生成'}
        </button>
        <button
          onClick={handleConfirm}
          disabled={confirmBlueprint.isPending || updateCourse.isPending}
          className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
        >
          {confirmBlueprint.isPending || updateCourse.isPending
            ? '确认中...'
            : '确认蓝图'}
        </button>
      </div>
    </div>
  );
}

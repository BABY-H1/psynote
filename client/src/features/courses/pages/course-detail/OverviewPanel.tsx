import type { CourseBlueprintData } from '@psynote/shared';
import { CardSection, CourseField } from './CourseFieldPrimitives';

/**
 * The "总" tab — course metadata (title, one-line description) + the
 * blueprint fields that define the course's shape (positioning, target,
 * goals, boundaries, referral advice).
 *
 * Pure presentation; every field toggles between read-span and input
 * based on `editing`.
 */
export function OverviewPanel({
  editing,
  title,
  description,
  blueprint,
  onTitleChange,
  onDescriptionChange,
  onBlueprintChange,
}: {
  editing: boolean;
  title: string;
  description: string;
  blueprint: CourseBlueprintData;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onBlueprintChange: <K extends keyof CourseBlueprintData>(
    key: K,
    value: CourseBlueprintData[K],
  ) => void;
}) {
  const isEmpty =
    !blueprint.positioning &&
    !blueprint.targetDescription &&
    !blueprint.boundaries &&
    blueprint.goals.length === 0 &&
    blueprint.sessions.length === 0;

  return (
    <div className="space-y-4">
      {isEmpty && !editing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          这个课程还没有蓝图。点击右上角「编辑」，然后在左侧 AI 助手里描述你想要的课程，AI 会帮你生成。
        </div>
      )}

      <CardSection title="课程信息">
        <CourseField label="课程名称" value={title} editing={editing} onChange={onTitleChange} required />
        <CourseField
          label="一句话简介"
          value={description}
          editing={editing}
          onChange={onDescriptionChange}
          type="textarea"
          rows={2}
        />
      </CardSection>

      <CardSection title="蓝图字段">
        <CourseField
          label="课程定位"
          value={blueprint.positioning}
          editing={editing}
          onChange={(v) => onBlueprintChange('positioning', v)}
          type="textarea"
          rows={2}
        />
        <CourseField
          label="适用对象"
          value={blueprint.targetDescription}
          editing={editing}
          onChange={(v) => onBlueprintChange('targetDescription', v)}
        />
        <CourseField
          label="适用边界"
          value={blueprint.boundaries}
          editing={editing}
          onChange={(v) => onBlueprintChange('boundaries', v)}
          type="textarea"
          rows={2}
        />
        <CourseField
          label="课程目标"
          value={blueprint.goals.join('\n')}
          editing={editing}
          onChange={(v) =>
            onBlueprintChange('goals', v.split('\n').map((s) => s.trim()).filter(Boolean))
          }
          type="textarea"
          rows={3}
          hint="每行一个目标"
        />
        <CourseField
          label="转介建议"
          value={blueprint.referralAdvice ?? ''}
          editing={editing}
          onChange={(v) => onBlueprintChange('referralAdvice', v)}
          type="textarea"
          rows={2}
        />
      </CardSection>
    </div>
  );
}

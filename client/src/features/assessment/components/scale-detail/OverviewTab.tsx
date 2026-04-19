import { CardSection, Field } from './CardSection';
import { SCORING_MODE_LABELS } from './types';

/**
 * The "总览" tab — title / description / instructions / scoring mode /
 * visibility. Pure presentation; every field flips between a read span
 * and an input based on `editing`.
 */
export function OverviewTab({
  editing,
  title,
  description,
  instructions,
  scoringMode,
  isPublic,
  onTitleChange,
  onDescriptionChange,
  onInstructionsChange,
  onScoringModeChange,
  onIsPublicChange,
}: {
  editing: boolean;
  title: string;
  description: string;
  instructions: string;
  scoringMode: string;
  isPublic: boolean;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onInstructionsChange: (v: string) => void;
  onScoringModeChange: (v: string) => void;
  onIsPublicChange: (v: boolean) => void;
}) {
  return (
    <CardSection title="量表基本信息">
      <Field label="量表名称" required>
        {editing ? (
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        ) : (
          <p className="text-sm text-slate-700">{title || <span className="text-slate-300 italic">未填写</span>}</p>
        )}
      </Field>

      <Field label="描述">
        {editing ? (
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
          />
        ) : description ? (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{description}</p>
        ) : (
          <p className="text-xs text-slate-300 italic">未填写</p>
        )}
      </Field>

      <Field label="作答指导语">
        {editing ? (
          <textarea
            value={instructions}
            onChange={(e) => onInstructionsChange(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
          />
        ) : instructions ? (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{instructions}</p>
        ) : (
          <p className="text-xs text-slate-300 italic">未填写</p>
        )}
      </Field>

      <Field label="计分模式">
        {editing ? (
          <select
            value={scoringMode}
            onChange={(e) => onScoringModeChange(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="sum">总分求和</option>
            <option value="average">平均分</option>
          </select>
        ) : (
          <p className="text-sm text-slate-700">{SCORING_MODE_LABELS[scoringMode] || scoringMode}</p>
        )}
      </Field>

      <Field label="可见范围">
        {editing ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => onIsPublicChange(e.target.checked)}
              className="rounded border-slate-300"
            />
            公开此量表（其他机构也可使用）
          </label>
        ) : (
          <p className="text-sm text-slate-700">{isPublic ? '公开' : '仅本机构'}</p>
        )}
      </Field>
    </CardSection>
  );
}

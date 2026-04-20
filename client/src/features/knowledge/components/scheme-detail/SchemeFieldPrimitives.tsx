import { useAssessments } from '../../../../api/useAssessments';

/**
 * Reusable field primitives shared across SchemeDetail's Overview +
 * SessionDetail tabs.
 */

export function InfoField({
  label,
  value,
  editing,
  onChange,
  type = 'input',
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  type?: 'input' | 'textarea';
}) {
  if (!editing && !value) return null;
  return (
    <div className="mb-2">
      <label className="text-xs text-slate-400 block mb-0.5">{label}</label>
      {editing ? (
        type === 'textarea' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        )
      ) : (
        <p className="text-xs text-slate-600 whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
}

/** Like InfoField, but always visible with a placeholder when empty in read mode. */
export function TemplateField({
  label,
  value,
  editing,
  onChange,
  placeholder,
  type = 'input',
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  placeholder: string;
  type?: 'input' | 'textarea';
}) {
  return (
    <div>
      <label className="text-xs text-slate-500 font-semibold block mb-1">{label}</label>
      {editing ? (
        type === 'textarea' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        )
      ) : value ? (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-xs text-slate-300 italic">{placeholder}</p>
      )}
    </div>
  );
}

/** Checkbox list of available assessments; filters out archived ones. */
export function AssessmentListField({
  label,
  description,
  ids,
  editing,
  onChange,
}: {
  label: string;
  description: string;
  ids: string[];
  editing: boolean;
  onChange: (v: string[]) => void;
}) {
  const { data: assessments } = useAssessments();
  const activeAssessments = (assessments || []).filter((a: any) => a.status !== 'archived');
  const getTitle = (id: string) =>
    activeAssessments.find((a: any) => a.id === id)?.title || id.slice(0, 8) + '...';

  if (!editing && ids.length === 0) return null;

  return (
    <div className="mb-2">
      <label className="text-xs text-slate-400 block mb-0.5">{label}</label>
      {editing ? (
        <div>
          <p className="text-xs text-slate-400 mb-1">{description}</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {activeAssessments.map((a: any) => (
              <label key={a.id} className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={ids.includes(a.id)}
                  onChange={(e) => {
                    if (e.target.checked) onChange([...ids, a.id]);
                    else onChange(ids.filter((id) => id !== a.id));
                  }}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-3 h-3"
                />
                {a.title}
              </label>
            ))}
          </div>
          {activeAssessments.length === 0 && (
            <p className="text-xs text-slate-400 italic">暂无可用量表</p>
          )}
        </div>
      ) : (
        <div className="space-y-0.5">
          {ids.map((id) => (
            <p key={id} className="text-xs text-slate-600">{getTitle(id)}</p>
          ))}
        </div>
      )}
    </div>
  );
}

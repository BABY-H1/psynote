import { X } from 'lucide-react';
import { InfoField, AssessmentListField } from './SchemeFieldPrimitives';
import type { EditData } from './types';
import { visibilityLabels } from './types';

/**
 * Overview tab — all top-level scheme fields: description, theory,
 * OKR (Objective + Key Results editor), target audience, group config,
 * facilitator requirements, recruitment/tracking assessments, visibility.
 */
export function OverviewPanel({
  data,
  editing,
  editData,
  uf,
}: {
  data: EditData;
  editing: boolean;
  editData: EditData | null;
  uf: (field: keyof EditData, value: any) => void;
}) {
  return (
    <div className="p-4 space-y-3">
      <InfoField label="方案描述" value={data.description} editing={editing} onChange={(v) => uf('description', v)} type="textarea" />
      <InfoField label="理论依据" value={data.theory} editing={editing} onChange={(v) => uf('theory', v)} type="textarea" />

      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold text-slate-500 mb-2">目标 (OKR)</p>
        <InfoField label="Objective（总目标）" value={data.overallGoal} editing={editing} onChange={(v) => uf('overallGoal', v)} type="textarea" />
        {editing ? (
          <div className="mt-2">
            <label className="text-xs text-slate-400 block mb-1">Key Results</label>
            {(editData?.specificGoals || []).map((kr, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-2 mb-1.5 space-y-1">
                <div className="flex gap-1">
                  <input
                    value={kr.title}
                    onChange={(e) => {
                      const goals = [...(editData?.specificGoals || [])];
                      goals[i] = { ...goals[i], title: e.target.value };
                      uf('specificGoals', goals);
                    }}
                    placeholder={`KR${i + 1}: 关键结果`}
                    className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    onClick={() => uf('specificGoals', (editData?.specificGoals || []).filter((_: any, j: number) => j !== i))}
                    className="text-slate-300 hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <input
                  value={kr.metric || ''}
                  onChange={(e) => {
                    const goals = [...(editData?.specificGoals || [])];
                    goals[i] = { ...goals[i], metric: e.target.value };
                    uf('specificGoals', goals);
                  }}
                  placeholder="衡量方式（如：前后测对比、行为观察）"
                  className="w-full px-2 py-1 border border-slate-100 rounded text-xs text-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            ))}
            <button
              onClick={() => uf('specificGoals', [...(editData?.specificGoals || []), { title: '', metric: '' }])}
              className="text-xs text-violet-600 hover:text-violet-800"
            >
              + 添加关键结果
            </button>
          </div>
        ) : data.specificGoals && data.specificGoals.length > 0 ? (
          <div className="mt-2">
            <label className="text-xs text-slate-400 block mb-1">Key Results</label>
            <ul className="space-y-0.5">
              {data.specificGoals.map((kr, i) => (
                <li key={i} className="text-xs text-slate-600">
                  <div className="flex gap-1.5">
                    <span className="text-violet-500 font-semibold">KR{i + 1}</span>
                    {kr.title}
                  </div>
                  {kr.metric && <div className="text-slate-400 ml-6 mt-0.5">衡量: {kr.metric}</div>}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold text-slate-500 mb-2">适用对象</p>
        <InfoField label="目标人群" value={data.targetAudience} editing={editing} onChange={(v) => uf('targetAudience', v)} />
        <InfoField label="适用年龄" value={data.ageRange} editing={editing} onChange={(v) => uf('ageRange', v)} />
        <InfoField label="筛选/排除标准" value={data.selectionCriteria} editing={editing} onChange={(v) => uf('selectionCriteria', v)} type="textarea" />
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold text-slate-500 mb-2">团体设置</p>
        <div className="grid grid-cols-2 gap-2">
          <InfoField label="建议人数" value={data.recommendedSize} editing={editing} onChange={(v) => uf('recommendedSize', v)} />
          <InfoField label="总次数" value={data.totalSessions?.toString() || ''} editing={editing} onChange={(v) => uf('totalSessions', v ? parseInt(v) : undefined)} />
          <InfoField label="每次时长" value={data.sessionDuration} editing={editing} onChange={(v) => uf('sessionDuration', v)} />
          <InfoField label="频率" value={data.frequency} editing={editing} onChange={(v) => uf('frequency', v)} />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <InfoField label="带领者要求" value={data.facilitatorRequirements} editing={editing} onChange={(v) => uf('facilitatorRequirements', v)} type="textarea" />
        <InfoField label="评估建议" value={data.evaluationMethod} editing={editing} onChange={(v) => uf('evaluationMethod', v)} type="textarea" />
        <InfoField label="注意事项" value={data.notes} editing={editing} onChange={(v) => uf('notes', v)} type="textarea" />
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold text-slate-500 mb-2">推荐量表</p>
        <AssessmentListField label="招募量表" description="报名时来访者需填写" ids={data.recruitmentAssessments || []} editing={editing} onChange={(v) => uf('recruitmentAssessments', v)} />
        <AssessmentListField label="整体评估量表" description="用于纵向追踪（入组+结束）" ids={data.overallAssessments || []} editing={editing} onChange={(v) => uf('overallAssessments', v)} />
        <InfoField label="筛选标准说明" value={data.screeningNotes || ''} editing={editing} onChange={(v) => uf('screeningNotes', v)} type="textarea" />
      </div>

      {editing && (
        <div className="border-t border-slate-100 pt-3">
          <label className="text-xs text-slate-400 block mb-1">可见范围</label>
          <select
            value={editData?.visibility || 'personal'}
            onChange={(e) => uf('visibility', e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {Object.entries(visibilityLabels).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

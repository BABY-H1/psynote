import React, { useState, useEffect } from 'react';
import { useClientProfile, useUpsertClientProfile } from '../../../api/useClientProfile';
import { useClientAISummary } from '../../../api/useAI';
import { useToast } from '../../../shared/components';
import { Edit3, Save, X, Plus, X as XIcon, Sparkles, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const genderLabels: Record<string, string> = {
  male: '男', female: '女', other: '其他', prefer_not_to_say: '不愿透露',
};
const maritalLabels: Record<string, string> = {
  single: '未婚', married: '已婚', divorced: '离异', widowed: '丧偶', other: '其他',
};
const educationOptions = ['初中及以下', '高中/中专', '大专', '本科', '硕士', '博士'];

interface Props {
  clientId: string;
  clientName: string;
  episodeId?: string;
}

export function ClientProfilePanel({ clientId, clientName, episodeId }: Props) {
  const { data: profile, isLoading } = useClientProfile(clientId);
  const upsert = useUpsertClientProfile();
  const aiSummary = useClientAISummary();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (profile) {
      setForm({ ...profile });
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      const { id, orgId, userId, createdAt, updatedAt, ...data } = form;
      await upsert.mutateAsync({ userId: clientId, ...data });
      toast('档案已保存', 'success');
      setEditing(false);
    } catch {
      toast('保存失败', 'error');
    }
  };

  const addTag = () => {
    if (!newTag.trim()) return;
    const issues = form.presentingIssues || [];
    if (!issues.includes(newTag.trim())) {
      setForm({ ...form, presentingIssues: [...issues, newTag.trim()] });
    }
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    setForm({
      ...form,
      presentingIssues: (form.presentingIssues || []).filter((t: string) => t !== tag),
    });
  };

  if (isLoading) {
    return <div className="text-sm text-slate-400 py-4">加载档案中...</div>;
  }

  const ec = form.emergencyContact || {};

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">
          来访者档案 — {clientName}
        </h3>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
              <X className="w-3 h-3" /> 取消
            </button>
            <button
              onClick={handleSave}
              disabled={upsert.isPending}
              className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 font-medium"
            >
              <Save className="w-3 h-3" /> {upsert.isPending ? '保存中...' : '保存'}
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            {episodeId && (
              <button
                onClick={() => aiSummary.mutate({ clientId, episodeId })}
                disabled={aiSummary.isPending}
                className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
              >
                {aiSummary.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {aiSummary.isPending ? 'AI 分析中...' : 'AI 概览'}
              </button>
            )}
            <button onClick={() => setEditing(true)} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
              <Edit3 className="w-3 h-3" /> 编辑
            </button>
          </div>
        )}
      </div>

      {/* AI Summary */}
      {aiSummary.data && (
        <AISummaryCard data={aiSummary.data} />
      )}
      {aiSummary.isError && (
        <div className="mb-4 text-xs text-red-500 bg-red-50 rounded-lg p-3">AI 分析失败，请检查 AI 服务是否已配置</div>
      )}

      <div className="space-y-4">
        {/* Basic info */}
        <Section title="基本信息">
          <div className="grid grid-cols-2 gap-3">
            <Field label="电话" value={form.phone} editing={editing} onChange={(v) => setForm({ ...form, phone: v })} />
            <Field
              label="性别"
              value={genderLabels[form.gender] || form.gender}
              editing={editing}
              type="select"
              options={Object.entries(genderLabels).map(([v, l]) => ({ value: v, label: l }))}
              rawValue={form.gender}
              onChange={(v) => setForm({ ...form, gender: v })}
            />
            <Field label="出生日期" value={form.dateOfBirth} editing={editing} type="date" onChange={(v) => setForm({ ...form, dateOfBirth: v })} />
            <Field label="职业" value={form.occupation} editing={editing} onChange={(v) => setForm({ ...form, occupation: v })} />
            <Field
              label="学历"
              value={form.education}
              editing={editing}
              type="select"
              options={educationOptions.map((o) => ({ value: o, label: o }))}
              rawValue={form.education}
              onChange={(v) => setForm({ ...form, education: v })}
            />
            <Field
              label="婚姻状况"
              value={maritalLabels[form.maritalStatus] || form.maritalStatus}
              editing={editing}
              type="select"
              options={Object.entries(maritalLabels).map(([v, l]) => ({ value: v, label: l }))}
              rawValue={form.maritalStatus}
              onChange={(v) => setForm({ ...form, maritalStatus: v })}
            />
          </div>
          {editing && (
            <div className="mt-2">
              <label className="block text-xs text-slate-500 mb-1">地址</label>
              <input
                value={form.address || ''}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
              />
            </div>
          )}
          {!editing && form.address && (
            <div className="mt-2 text-xs text-slate-500">地址：{form.address}</div>
          )}
        </Section>

        {/* Emergency contact */}
        <Section title="紧急联系人">
          {editing ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">姓名</label>
                <input
                  value={ec.name || ''}
                  onChange={(e) => setForm({ ...form, emergencyContact: { ...ec, name: e.target.value } })}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">电话</label>
                <input
                  value={ec.phone || ''}
                  onChange={(e) => setForm({ ...form, emergencyContact: { ...ec, phone: e.target.value } })}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">关系</label>
                <input
                  value={ec.relationship || ''}
                  onChange={(e) => setForm({ ...form, emergencyContact: { ...ec, relationship: e.target.value } })}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
                />
              </div>
            </div>
          ) : ec.name ? (
            <div className="text-sm text-slate-600">
              {ec.name}（{ec.relationship || '未注明'}）{ec.phone}
            </div>
          ) : (
            <div className="text-xs text-slate-400">未填写</div>
          )}
        </Section>

        {/* Medical history */}
        <Section title="既往病史/用药">
          <TextArea value={form.medicalHistory} editing={editing} onChange={(v) => setForm({ ...form, medicalHistory: v })} />
        </Section>

        {/* Family background */}
        <Section title="家庭背景">
          <TextArea value={form.familyBackground} editing={editing} onChange={(v) => setForm({ ...form, familyBackground: v })} />
        </Section>

        {/* Presenting issues */}
        <Section title="主要问题">
          <div className="flex flex-wrap gap-1.5">
            {(form.presentingIssues || []).map((tag: string) => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full text-xs">
                {tag}
                {editing && (
                  <button onClick={() => removeTag(tag)} className="hover:text-brand-900">
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
            {editing && (
              <div className="inline-flex items-center gap-1">
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="添加标签"
                  className="w-20 px-2 py-0.5 border border-slate-200 rounded text-xs"
                />
                <button onClick={addTag} className="text-brand-600 hover:text-brand-700">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            )}
            {!editing && (form.presentingIssues || []).length === 0 && (
              <span className="text-xs text-slate-400">未填写</span>
            )}
          </div>
        </Section>

        {/* Notes */}
        <Section title="咨询师备注">
          <TextArea value={form.notes} editing={editing} onChange={(v) => setForm({ ...form, notes: v })} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-slate-400 mb-2">{title}</h4>
      {children}
    </div>
  );
}

function Field({
  label, value, editing, type = 'text', options, rawValue, onChange,
}: {
  label: string;
  value?: string;
  editing: boolean;
  type?: 'text' | 'date' | 'select';
  options?: { value: string; label: string }[];
  rawValue?: string;
  onChange: (v: string) => void;
}) {
  if (!editing) {
    return (
      <div>
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-sm text-slate-700">{value || '—'}</div>
      </div>
    );
  }
  if (type === 'select' && options) {
    return (
      <div>
        <label className="block text-xs text-slate-500 mb-1">{label}</label>
        <select
          value={rawValue || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
        >
          <option value="">未选择</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input
        type={type}
        value={(type === 'text' ? value : rawValue) || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
      />
    </div>
  );
}

function TextArea({ value, editing, onChange }: { value?: string; editing: boolean; onChange: (v: string) => void }) {
  if (!editing) {
    return <div className="text-sm text-slate-600 whitespace-pre-wrap">{value || <span className="text-xs text-slate-400">未填写</span>}</div>;
  }
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full px-3 py-2 border border-slate-200 rounded text-sm"
    />
  );
}

const trendIcons: Record<string, React.ReactNode> = {
  improving: <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />,
  stable: <Minus className="w-3.5 h-3.5 text-slate-400" />,
  worsening: <TrendingDown className="w-3.5 h-3.5 text-red-500" />,
};

const trendLabels: Record<string, string> = {
  improving: '好转', stable: '稳定', worsening: '恶化',
};

function AISummaryCard({ data }: { data: { overview: string; keyThemes: string[]; riskProfile: { currentLevel: string; trend: string; factors: string[]; protectiveFactors: string[] }; treatmentProgress: string; recommendations: string[] } }) {
  return (
    <div className="mb-4 bg-brand-50 border border-brand-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-brand-700">
        <Sparkles className="w-3.5 h-3.5" /> AI 来访者概览
      </div>

      <p className="text-sm text-slate-700">{data.overview}</p>

      <div className="flex flex-wrap gap-1.5">
        {data.keyThemes.map((t) => (
          <span key={t} className="px-2 py-0.5 bg-white border border-brand-200 rounded-full text-xs text-brand-700">{t}</span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">风险画像</div>
          <div className="flex items-center gap-1.5 text-sm">
            {trendIcons[data.riskProfile.trend]}
            <span className="font-medium text-slate-700">{trendLabels[data.riskProfile.trend] || data.riskProfile.trend}</span>
          </div>
          {data.riskProfile.factors.length > 0 && (
            <div className="mt-1.5 text-xs text-red-600">
              风险：{data.riskProfile.factors.join('、')}
            </div>
          )}
          {data.riskProfile.protectiveFactors.length > 0 && (
            <div className="mt-1 text-xs text-emerald-600">
              保护：{data.riskProfile.protectiveFactors.join('、')}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">治疗进展</div>
          <div className="text-sm text-slate-700">{data.treatmentProgress}</div>
        </div>
      </div>

      {data.recommendations.length > 0 && (
        <div>
          <div className="text-xs text-slate-400 mb-1">建议</div>
          <div className="space-y-1">
            {data.recommendations.map((r, i) => (
              <div key={i} className="text-xs text-slate-600">• {r}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

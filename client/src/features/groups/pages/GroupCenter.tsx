import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  useGroupSchemes, useGroupInstances, useCreateGroupInstance,
  useGroupInstance, useUpdateGroupInstance, useUpdateEnrollment,
} from '../../../api/useGroups';
import { useGenerateScheme } from '../../../api/useAI';
import { PageLoading, EmptyState, useToast } from '../../../shared/components';

const statusLabels: Record<string, { text: string; color: string }> = {
  draft: { text: '草稿', color: 'bg-slate-100 text-slate-600' },
  recruiting: { text: '招募中', color: 'bg-green-100 text-green-700' },
  ongoing: { text: '进行中', color: 'bg-blue-100 text-blue-700' },
  full: { text: '已满', color: 'bg-yellow-100 text-yellow-700' },
  ended: { text: '已结束', color: 'bg-slate-100 text-slate-500' },
};

export function GroupCenter() {
  const { data: instances, isLoading } = useGroupInstances();
  const { data: schemes } = useGroupSchemes();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAIGen, setShowAIGen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiScheme, setAiScheme] = useState<{
    title: string;
    description: string;
    theory: string;
    category: string;
    duration: string;
    schedule: string;
    capacity: number;
    sessions: { title: string; goal: string; activities: string; materials: string; duration: string }[];
  } | null>(null);
  const generateScheme = useGenerateScheme();

  if (selectedId) {
    return <InstanceDetail instanceId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">团辅中心</h2>
          <p className="text-sm text-slate-500 mt-1">管理团体辅导活动</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowAIGen(true); setAiScheme(null); setAiPrompt(''); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 transition"
          >
            <Sparkles className="w-4 h-4" />
            AI 生成方案
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition"
          >
            发布活动
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateInstanceForm
          schemes={schemes || []}
          onClose={() => { setShowCreate(false); setAiScheme(null); }}
          prefill={aiScheme}
        />
      )}

      {/* AI Generation Modal */}
      {showAIGen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-500" />
                AI 生成团辅方案
              </h3>
              <button
                onClick={() => setShowAIGen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                &times;
              </button>
            </div>

            {!aiScheme ? (
              <div className="space-y-4">
                <textarea
                  placeholder="描述你想要的团辅方案，例如：设计一个面向大学生的8周压力管理团辅方案，采用认知行为疗法，每次90分钟"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
                <button
                  disabled={!aiPrompt.trim() || generateScheme.isPending}
                  onClick={() => {
                    generateScheme.mutate(
                      { prompt: aiPrompt.trim() },
                      { onSuccess: (res) => setAiScheme(res) },
                    );
                  }}
                  className="w-full py-2.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  {generateScheme.isPending ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      AI 正在设计方案...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      开始生成
                    </>
                  )}
                </button>
                {generateScheme.isError && (
                  <p className="text-sm text-red-500">生成失败，请重试</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Scheme preview */}
                <div className="space-y-3">
                  <div>
                    <h4 className="text-lg font-bold text-slate-900">{aiScheme.title}</h4>
                    {aiScheme.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{aiScheme.category}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">{aiScheme.description}</p>
                  {aiScheme.theory && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-slate-500 mb-1">理论基础</p>
                      <p className="text-sm text-slate-700">{aiScheme.theory}</p>
                    </div>
                  )}
                  <div className="flex gap-4 text-xs text-slate-500">
                    {aiScheme.duration && <span>时长: {aiScheme.duration}</span>}
                    {aiScheme.schedule && <span>频率: {aiScheme.schedule}</span>}
                    {aiScheme.capacity && <span>容量: {aiScheme.capacity}人</span>}
                  </div>
                </div>

                {/* Session list */}
                {aiScheme.sessions?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">
                      单元列表 ({aiScheme.sessions.length} 次)
                    </p>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {aiScheme.sessions.map((s, i) => (
                        <div key={i} className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{s.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{s.goal}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setAiScheme(null)}
                    className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
                  >
                    重新生成
                  </button>
                  <button
                    onClick={() => {
                      setShowAIGen(false);
                      setShowCreate(true);
                      // Populate create form via a callback isn't straightforward with
                      // sibling state, so we store the scheme and pass it down.
                    }}
                    className="flex-1 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 transition"
                  >
                    应用方案
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <PageLoading />
      ) : !instances || instances.length === 0 ? (
        <EmptyState title="暂无团辅活动" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {instances.map((inst) => {
            const st = statusLabels[inst.status] || statusLabels.draft;
            return (
              <button
                key={inst.id}
                onClick={() => setSelectedId(inst.id)}
                className="text-left bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900 truncate">{inst.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.text}</span>
                </div>
                {inst.description && (
                  <p className="text-sm text-slate-500 line-clamp-2">{inst.description}</p>
                )}
                <div className="flex gap-4 mt-3 text-xs text-slate-400">
                  {inst.startDate && <span>{inst.startDate}</span>}
                  {inst.location && <span>{inst.location}</span>}
                  {inst.capacity && <span>容量: {inst.capacity}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InstanceDetail({ instanceId, onBack }: { instanceId: string; onBack: () => void }) {
  const { data: instance } = useGroupInstance(instanceId);
  const updateInstance = useUpdateGroupInstance();
  const updateEnrollment = useUpdateEnrollment();
  const { toast } = useToast();

  if (!instance) return <PageLoading />;

  const st = statusLabels[instance.status] || statusLabels.draft;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700 mb-4">
        &larr; 返回列表
      </button>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{instance.title}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.text}</span>
          </div>
          <div className="flex gap-2">
            {instance.status === 'draft' && (
              <button
                onClick={() => updateInstance.mutate({ instanceId, status: 'recruiting' }, { onSuccess: () => toast('已开始招募', 'success') })}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-500"
              >
                开始招募
              </button>
            )}
            {instance.status === 'recruiting' && (
              <button
                onClick={() => updateInstance.mutate({ instanceId, status: 'ongoing' }, { onSuccess: () => toast('活动已开始', 'success') })}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-500"
              >
                开始活动
              </button>
            )}
          </div>
        </div>
        {instance.description && <p className="text-sm text-slate-600">{instance.description}</p>}
        <div className="flex gap-6 mt-4 text-sm text-slate-500">
          {instance.startDate && <span>开始: {instance.startDate}</span>}
          {instance.location && <span>地点: {instance.location}</span>}
          {instance.schedule && <span>安排: {instance.schedule}</span>}
        </div>
      </div>

      {/* Enrollments */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900 mb-4">
          报名成员 ({instance.enrollments?.length || 0}{instance.capacity ? `/${instance.capacity}` : ''})
        </h3>
        {(!instance.enrollments || instance.enrollments.length === 0) ? (
          <EmptyState title="暂无报名" />
        ) : (
          <div className="space-y-2">
            {instance.enrollments.map((e) => (
              <div key={e.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <span className="text-sm font-medium text-slate-900">{e.user?.name || '未知'}</span>
                  <span className="text-xs text-slate-400 ml-2">{e.user?.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    e.status === 'approved' ? 'bg-green-100 text-green-700'
                    : e.status === 'rejected' ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {e.status === 'approved' ? '已通过' : e.status === 'rejected' ? '已拒绝' : '待审批'}
                  </span>
                  {e.status === 'pending' && (
                    <>
                      <button
                        onClick={() => updateEnrollment.mutate({ enrollmentId: e.id, status: 'approved' }, { onSuccess: () => toast('已通过审批', 'success') })}
                        className="text-xs text-green-600 hover:underline"
                      >
                        通过
                      </button>
                      <button
                        onClick={() => updateEnrollment.mutate({ enrollmentId: e.id, status: 'rejected' }, { onSuccess: () => toast('已拒绝', 'success') })}
                        className="text-xs text-red-500 hover:underline"
                      >
                        拒绝
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateInstanceForm({
  schemes,
  onClose,
  prefill,
}: {
  schemes: { id: string; title: string }[];
  onClose: () => void;
  prefill?: {
    title: string;
    description: string;
    capacity: number;
    schedule?: string;
  } | null;
}) {
  const createInstance = useCreateGroupInstance();
  const { toast } = useToast();
  const [title, setTitle] = useState(prefill?.title || '');
  const [description, setDescription] = useState(prefill?.description || '');
  const [schemeId, setSchemeId] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState(prefill?.capacity || 12);
  const [startDate, setStartDate] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createInstance.mutateAsync({
      title,
      description: description || undefined,
      schemeId: schemeId || undefined,
      location: location || undefined,
      capacity,
      startDate: startDate || undefined,
    });
    toast('活动发布成功', 'success');
    onClose();
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
      <h3 className="font-semibold text-slate-900 mb-4">发布团辅活动</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          placeholder="活动名称"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <textarea
          placeholder="活动描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <div className="grid grid-cols-2 gap-4">
          <select
            value={schemeId}
            onChange={(e) => setSchemeId(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">不使用方案模板</option>
            {schemes.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="容量"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <input
            placeholder="地点"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">
            取消
          </button>
          <button
            type="submit"
            disabled={createInstance.isPending}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
          >
            {createInstance.isPending ? '发布中...' : '发布'}
          </button>
        </div>
      </form>
    </div>
  );
}

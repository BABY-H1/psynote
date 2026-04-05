import React, { useState } from 'react';
import {
  useGroupSchemes, useGroupInstances, useCreateGroupInstance,
  useUpdateGroupInstance, useDeleteGroupInstance,
} from '../../../api/useGroups';
import { useAssessments } from '../../../api/useAssessments';
import { PageLoading, EmptyState, useToast } from '../../../shared/components';
import { GroupInstanceDetail } from '../components/GroupInstanceDetail';
import { Plus, Search, UserPlus, UserMinus, Send, Edit3, Trash2, X, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const statusLabels: Record<string, { text: string; color: string }> = {
  draft: { text: '草稿', color: 'bg-slate-100 text-slate-600' },
  recruiting: { text: '招募中', color: 'bg-green-100 text-green-700' },
  ongoing: { text: '进行中', color: 'bg-blue-100 text-blue-700' },
  full: { text: '已满', color: 'bg-yellow-100 text-yellow-700' },
  ended: { text: '已结束', color: 'bg-slate-100 text-slate-500' },
};

const statusFilters = [
  { value: '', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'recruiting', label: '招募中' },
  { value: 'ongoing', label: '进行中' },
  { value: 'ended', label: '已结束' },
];

type ViewMode = 'list' | 'create' | 'detail';

export function GroupCenter() {
  const [view, setView] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [shareModalId, setShareModalId] = useState<string | null>(null);

  const { data: instances, isLoading } = useGroupInstances(statusFilter || undefined);
  const updateInstance = useUpdateGroupInstance();
  const deleteInstance = useDeleteGroupInstance();
  const { toast } = useToast();

  const filteredInstances = instances?.filter((inst) =>
    !search || inst.title.toLowerCase().includes(search.toLowerCase()),
  );

  if (view === 'detail' && selectedId) {
    return <GroupInstanceDetail instanceId={selectedId} onClose={() => { setView('list'); setSelectedId(null); }} />;
  }

  if (view === 'create') {
    return <CreateInstancePage onClose={() => setView('list')} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">团辅中心</h2>
          <p className="text-sm text-slate-500 mt-1">管理团体辅导活动</p>
        </div>
        <button
          onClick={() => setView('create')}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition"
        >
          <Plus className="w-4 h-4" />
          发布活动
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索活动..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                statusFilter === f.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Instance List */}
      {isLoading ? (
        <PageLoading />
      ) : !filteredInstances || filteredInstances.length === 0 ? (
        <EmptyState title="暂无团辅活动" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredInstances.map((inst) => {
            const st = statusLabels[inst.status] || statusLabels.draft;
            const isRecruiting = inst.status === 'recruiting';
            return (
              <div key={inst.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm hover:border-slate-300 transition flex">
                <button
                  onClick={() => { setSelectedId(inst.id); setView('detail'); }}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 truncate">{inst.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${st.color}`}>{st.text}</span>
                  </div>
                  {inst.description && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{inst.description}</p>
                  )}
                  <div className="flex gap-4 mt-2 text-xs text-slate-400">
                    {inst.startDate && <span>{inst.startDate}</span>}
                    {inst.location && <span>{inst.location}</span>}
                    {inst.capacity && <span>容量: {inst.capacity}</span>}
                  </div>
                </button>
                {/* Action buttons */}
                <div className="flex gap-1 ml-4 shrink-0">
                  {/* Recruit toggle */}
                  {(inst.status === 'draft' || inst.status === 'recruiting') && (
                    <button
                      onClick={() => updateInstance.mutate(
                        { instanceId: inst.id, status: isRecruiting ? 'draft' : 'recruiting' },
                        { onSuccess: () => toast(isRecruiting ? '已停止招募' : '已开始招募', 'success') },
                      )}
                      className={`p-2 rounded-lg transition ${isRecruiting ? 'text-green-500 hover:text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:text-green-600 hover:bg-green-50'}`}
                      title={isRecruiting ? '停止招募' : '开始招募'}
                    >
                      {isRecruiting ? <UserMinus className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                    </button>
                  )}
                  {/* Share/publish recruitment */}
                  {inst.status === 'recruiting' && (
                    <button
                      onClick={() => setShareModalId(inst.id)}
                      className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                      title="发布招募链接"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                  {/* Edit */}
                  <button
                    onClick={() => { setSelectedId(inst.id); setView('detail'); }}
                    className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => {
                      if (confirm('确定删除此团辅活动？相关的报名和出勤记录也将被删除。')) {
                        deleteInstance.mutate(inst.id, {
                          onSuccess: () => toast('已删除', 'success'),
                          onError: (err: any) => toast(err.message || '删除失败', 'error'),
                        });
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Share Modal */}
      {shareModalId && (
        <RecruitmentShareModal instanceId={shareModalId} onClose={() => setShareModalId(null)} />
      )}
    </div>
  );
}

function RecruitmentShareModal({ instanceId, onClose }: { instanceId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const enrollUrl = `${window.location.origin}/enroll/${instanceId}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(enrollUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">招募链接</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-4">
          分享以下链接或二维码，来访者无需登录即可查看活动介绍并报名。
        </p>

        {/* Link */}
        <div className="flex items-center gap-2 mb-4">
          <input
            readOnly
            value={enrollUrl}
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 truncate"
          />
          <button
            onClick={handleCopy}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
              copied ? 'bg-green-100 text-green-700' : 'bg-brand-600 text-white hover:bg-brand-500'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* QR Code */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 flex flex-col items-center">
          <div className="bg-white p-3 rounded-xl shadow-sm">
            <QRCodeSVG value={enrollUrl} size={160} level="M" />
          </div>
          <p className="text-xs text-slate-400 mt-3">扫描二维码报名</p>
        </div>
      </div>
    </div>
  );
}

// ─── Create Instance Page ─────────────────────────────────────

function CreateInstancePage({ onClose }: { onClose: () => void }) {
  const { data: schemes } = useGroupSchemes();
  const { data: assessments } = useAssessments();
  const createInstance = useCreateGroupInstance();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [schemeId, setSchemeId] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState(12);
  const [startDate, setStartDate] = useState('');
  const [schedule, setSchedule] = useState('');
  const [recruitmentAssessments, setRecruitmentAssessments] = useState<string[]>([]);
  const [overallAssessments, setOverallAssessments] = useState<string[]>([]);

  const selectedScheme = schemes?.find((s) => s.id === schemeId);

  const handleSchemeChange = (sid: string) => {
    setSchemeId(sid);
    const scheme = schemes?.find((s: any) => s.id === sid);
    if (scheme) {
      if (!title) setTitle(scheme.title);
      if (!description) setDescription(scheme.description || '');
      // Inherit assessment config from scheme
      setRecruitmentAssessments((scheme as any).recruitmentAssessments || []);
      setOverallAssessments((scheme as any).overallAssessments || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createInstance.mutateAsync({
        title,
        description: description || undefined,
        schemeId: schemeId || undefined,
        location: location || undefined,
        capacity,
        startDate: startDate || undefined,
        schedule: schedule || undefined,
        recruitmentAssessments: recruitmentAssessments.length > 0 ? recruitmentAssessments : undefined,
        overallAssessments: overallAssessments.length > 0 ? overallAssessments : undefined,
      });
      toast('活动发布成功', 'success');
      onClose();
    } catch {
      toast('发布失败', 'error');
    }
  };

  const activeAssessments = assessments?.filter((a: any) => a.status !== 'archived') || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">
          &larr; 返回
        </button>
        <h2 className="text-xl font-bold text-slate-900">发布团辅活动</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* Scheme Selection */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">选择方案模板</h3>
          <select
            value={schemeId}
            onChange={(e) => handleSchemeChange(e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">不使用方案模板（手动填写）</option>
            {schemes?.map((s) => (
              <option key={s.id} value={s.id}>{s.title} ({s.sessions?.length || 0}次活动)</option>
            ))}
          </select>
          {selectedScheme && (
            <div className="mt-3 p-3 bg-violet-50 rounded-lg text-xs text-violet-700">
              {selectedScheme.description && <p>{selectedScheme.description}</p>}
              <p className="mt-1">共 {selectedScheme.sessions?.length || 0} 次活动</p>
            </div>
          )}
        </div>

        {/* Basic Info */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">基本信息</h3>
          <div>
            <label className="block text-xs text-slate-500 mb-1">活动名称 *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required
              placeholder="如：大学生压力管理团体辅导"
              className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">活动描述</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="活动简介..."
              className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">地点</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="如：心理咨询中心团辅室"
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">容量</label>
              <input type="number" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}
                min={1}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">开始日期</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">安排频率</label>
              <input value={schedule} onChange={(e) => setSchedule(e.target.value)}
                placeholder="如：每周三 14:00-15:30"
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
        </div>

        {/* Assessment Binding */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">评估量表配置（可选）</h3>
          <p className="text-xs text-slate-400">
            {schemeId ? '已从方案继承，可调整' : '绑定量表用于招募筛选和效果评估'}
          </p>

          {/* Recruitment assessments */}
          <div>
            <label className="block text-xs text-slate-500 mb-2">招募量表</label>
            <p className="text-xs text-slate-400 mb-2">报名时来访者需要填写的量表</p>
            <div className="space-y-1">
              {activeAssessments.map((a: any) => (
                <label key={a.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={recruitmentAssessments.includes(a.id)}
                    onChange={(e) => {
                      if (e.target.checked) setRecruitmentAssessments([...recruitmentAssessments, a.id]);
                      else setRecruitmentAssessments(recruitmentAssessments.filter((id) => id !== a.id));
                    }}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  {a.title}
                </label>
              ))}
            </div>
            {activeAssessments.length === 0 && (
              <p className="text-xs text-slate-400 italic">暂无可用量表，请先在测评管理中创建</p>
            )}
          </div>

          {/* Overall assessments (longitudinal tracking) */}
          <div>
            <label className="block text-xs text-slate-500 mb-2">整体评估量表</label>
            <p className="text-xs text-slate-400 mb-2">用于纵向追踪（入组时测 + 结束时测，对比效果）</p>
            <div className="space-y-1">
              {activeAssessments.map((a: any) => (
                <label key={a.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={overallAssessments.includes(a.id)}
                    onChange={(e) => {
                      if (e.target.checked) setOverallAssessments([...overallAssessments, a.id]);
                      else setOverallAssessments(overallAssessments.filter((id) => id !== a.id));
                    }}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  {a.title}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            取消
          </button>
          <button type="submit" disabled={createInstance.isPending || !title}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 transition">
            {createInstance.isPending ? '发布中...' : '发布活动'}
          </button>
        </div>
      </form>
    </div>
  );
}

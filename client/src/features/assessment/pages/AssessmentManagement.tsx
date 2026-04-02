import React, { useState } from 'react';
import { useAssessments, useCreateAssessment, useDeleteAssessment } from '../../../api/useAssessments';
import { useScales } from '../../../api/useScales';
import { PageLoading, EmptyState, StatusBadge, PageHeader, useToast } from '../../../shared/components';

export function AssessmentManagement() {
  const { data: assessments, isLoading } = useAssessments();
  const { data: scales } = useScales();
  const createAssessment = useCreateAssessment();
  const deleteAssessment = useDeleteAssessment();
  const [showCreate, setShowCreate] = useState(false);
  const { toast } = useToast();

  if (isLoading) {
    return <PageLoading text="加载测评列表中..." />;
  }

  return (
    <div>
      <PageHeader
        title="测评管理"
        description="创建和管理测评活动"
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition"
          >
            新建测评
          </button>
        }
      />

      {showCreate && (
        <CreateAssessmentForm
          scales={scales || []}
          onSubmit={async (data) => {
            await createAssessment.mutateAsync(data);
            setShowCreate(false);
            toast('测评创建成功', 'success');
          }}
          onCancel={() => setShowCreate(false)}
          isPending={createAssessment.isPending}
        />
      )}

      {!assessments || assessments.length === 0 ? (
        <EmptyState
          title="暂无测评"
          action={{ label: '创建第一个测评', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div className="grid gap-4">
          {assessments.map((assessment) => (
            <div
              key={assessment.id}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 truncate">
                      {assessment.title}
                    </h3>
                    <StatusBadge
                      label={assessment.isActive ? '进行中' : '已停用'}
                      variant={assessment.isActive ? 'green' : 'slate'}
                    />
                  </div>
                  {assessment.description && (
                    <p className="text-sm text-slate-500 mt-1">{assessment.description}</p>
                  )}
                  <div className="flex gap-4 mt-3 text-xs text-slate-400">
                    <span>
                      创建于 {new Date(assessment.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => {
                      if (confirm('确定删除此测评？')) {
                        deleteAssessment.mutate(assessment.id, {
                          onSuccess: () => toast('测评已删除', 'success'),
                        });
                      }
                    }}
                    className="text-sm text-slate-400 hover:text-red-600 px-3 py-1"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateAssessmentForm({
  scales,
  onSubmit,
  onCancel,
  isPending,
}: {
  scales: { id: string; title: string }[];
  onSubmit: (data: { title: string; description?: string; scaleIds: string[] }) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedScaleIds, setSelectedScaleIds] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      title,
      description: description || undefined,
      scaleIds: selectedScaleIds,
    });
  };

  const toggleScale = (scaleId: string) => {
    setSelectedScaleIds((prev) =>
      prev.includes(scaleId) ? prev.filter((id) => id !== scaleId) : [...prev, scaleId],
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
      <h3 className="font-semibold text-slate-900 mb-4">创建测评</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          placeholder="测评名称"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <textarea
          placeholder="描述（可选）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">选择量表</label>
          {scales.length === 0 ? (
            <p className="text-sm text-slate-400">暂无可用量表，请先创建量表</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {scales.map((scale) => (
                <label
                  key={scale.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedScaleIds.includes(scale.id)}
                    onChange={() => toggleScale(scale.id)}
                    className="rounded"
                  />
                  <span className="text-sm text-slate-700">{scale.title}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isPending || selectedScaleIds.length === 0}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
          >
            {isPending ? '创建中...' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}

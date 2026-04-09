import React, { useState } from 'react';
import {
  useCourseInstance,
  useInstanceEnrollments,
  useUpdateEnrollmentApproval,
  useFeedbackForms,
  useHomeworkDefs,
  useFeedbackResponses,
  useHomeworkSubmissions,
  useReviewHomework,
} from '../../../api/useCourseInstances';
import {
  PageLoading,
  useToast,
  ServiceDetailLayout,
  ServiceTabBar,
  type ServiceTab,
} from '../../../shared/components';
import type { ServiceStatus } from '@psynote/shared';
import {
  Users,
  MessageSquare,
  BookOpen,
  Check,
  X,
  Search,
  Eye,
} from 'lucide-react';

/**
 * Phase 4b — CourseInstanceDetail migrated to Phase 2 shared components.
 *
 * Visual & behavioural changes:
 *  - Header (back / title / status pill / meta) is provided by `<ServiceDetailLayout variant="tabs">`.
 *  - Tab bar uses `<ServiceTabBar>` with custom labels:
 *      overview     → 总览
 *      participants → 学员
 *      timeline     → 进度
 *      records      → 反馈与作业
 *    The 5th standard tab "资产" is hidden via visibleTabs.
 *  - "closed" status keeps its grey "已结束" text via the layout default.
 *  - "archived" was previously yellow in courses; we preserve that via overrides.
 *
 * Tab content components (OverviewTab/MembersTab/ProgressTab/FeedbackHomeworkTab)
 * are slotted in unchanged.
 */

interface Props {
  instanceId: string;
  onClose: () => void;
}

const VISIBLE_TABS: ServiceTab[] = ['overview', 'participants', 'timeline', 'records'];
const TAB_LABELS: Partial<Record<ServiceTab, string>> = {
  participants: '学员',
  timeline: '进度',
  records: '反馈与作业',
};
const TAB_ICONS: Partial<Record<ServiceTab, React.ReactNode>> = {
  participants: <Users className="w-4 h-4" />,
  timeline: <Eye className="w-4 h-4" />,
  records: <MessageSquare className="w-4 h-4" />,
};

function mapCourseStatus(s: string): ServiceStatus {
  switch (s) {
    case 'draft':
      return 'draft';
    case 'active':
      return 'ongoing';
    case 'closed':
      return 'closed';
    case 'archived':
      return 'archived';
    default:
      return 'draft';
  }
}

const approvalLabels: Record<string, { text: string; color: string }> = {
  pending: { text: '待审核', color: 'text-yellow-600 bg-yellow-50' },
  approved: { text: '已通过', color: 'text-green-600 bg-green-50' },
  rejected: { text: '已拒绝', color: 'text-red-600 bg-red-50' },
};

const enrollStatusLabels: Record<string, { text: string; color: string }> = {
  enrolled: { text: '学习中', color: 'text-blue-600 bg-blue-50' },
  completed: { text: '已完成', color: 'text-green-600 bg-green-50' },
  dropped: { text: '已退出', color: 'text-slate-500 bg-slate-50' },
};

const sourceLabels: Record<string, string> = {
  assigned: '指派',
  class: '班级',
  public: '公开报名',
};

// ─── Main Component ───────────────────────────────────────────

export function CourseInstanceDetail({ instanceId, onClose }: Props) {
  const { data: instance, isLoading } = useCourseInstance(instanceId);
  const [tab, setTab] = useState<ServiceTab>('overview');

  if (isLoading || !instance) return <PageLoading text="加载课程详情..." />;

  const isArchived = instance.status === 'archived';

  return (
    <ServiceDetailLayout
      title={instance.title}
      status={mapCourseStatus(instance.status)}
      // Preserve the previous yellow tone for "archived" courses
      statusClassName={isArchived ? 'bg-yellow-100 text-yellow-700' : undefined}
      metaLine={
        <>
          {(instance as any).course?.title && <span>课程: {(instance as any).course.title}</span>}
          {instance.createdAt && (
            <span>创建: {new Date(instance.createdAt).toLocaleDateString()}</span>
          )}
        </>
      }
      onBack={onClose}
      tabBar={
        <ServiceTabBar
          value={tab}
          onChange={setTab}
          visibleTabs={VISIBLE_TABS}
          labels={TAB_LABELS}
          icons={TAB_ICONS}
        />
      }
    >
      {tab === 'overview' && <OverviewTab instance={instance} />}
      {tab === 'participants' && <MembersTab instanceId={instanceId} />}
      {tab === 'timeline' && <ProgressTab instanceId={instanceId} instance={instance} />}
      {tab === 'records' && <FeedbackHomeworkTab instanceId={instanceId} />}
    </ServiceDetailLayout>
  );
}

// ─── Tab 1: Overview ──────────────────────────────────────────

function OverviewTab({ instance }: { instance: any }) {
  const enrollments = instance.enrollments || [];
  const enrolledCount = enrollments.length;
  const completedCount = enrollments.filter((e: any) => e.status === 'completed').length;
  const completionRate = enrolledCount > 0 ? Math.round((completedCount / enrolledCount) * 100) : 0;

  const publishModeLabels: Record<string, string> = {
    assigned: '指派制',
    class: '班级制',
    public: '公开报名',
  };

  const stats = [
    { label: '报名人数', value: enrolledCount, color: 'text-blue-600' },
    { label: '已完成', value: completedCount, color: 'text-green-600' },
    { label: '完成率', value: `${completionRate}%`, color: 'text-indigo-600' },
    {
      label: '发布模式',
      value: publishModeLabels[instance.publishMode] || instance.publishMode || '-',
      color: 'text-slate-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Instance Info */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">课程信息</h3>
        {instance.description && (
          <div>
            <p className="text-xs text-slate-400">描述</p>
            <p className="text-sm text-slate-700 mt-0.5">{instance.description}</p>
          </div>
        )}
        {instance.course?.title && (
          <div>
            <p className="text-xs text-slate-400">来源课程</p>
            <p className="text-sm text-slate-700 mt-0.5">{instance.course.title}</p>
          </div>
        )}
        {instance.createdAt && (
          <div>
            <p className="text-xs text-slate-400">创建日期</p>
            <p className="text-sm text-slate-700 mt-0.5">
              {new Date(instance.createdAt).toLocaleDateString()}
            </p>
          </div>
        )}
        {instance.responsiblePerson && (
          <div>
            <p className="text-xs text-slate-400">负责人</p>
            <p className="text-sm text-slate-700 mt-0.5">
              {instance.responsiblePerson.name || instance.responsiblePerson}
            </p>
          </div>
        )}
      </div>

      {/* Share link for public mode */}
      {instance.publishMode === 'public' && instance.shareLink && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">公开报名链接</h3>
          <div className="flex items-center gap-3">
            <input
              readOnly
              value={instance.shareLink}
              className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-600"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(instance.shareLink);
              }}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500"
            >
              复制
            </button>
          </div>
          {instance.qrCode && (
            <div className="mt-2">
              <img
                src={instance.qrCode}
                alt="QR Code"
                className="w-32 h-32 border border-slate-200 rounded-lg"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Members ───────────────────────────────────────────

function MembersTab({ instanceId }: { instanceId: string }) {
  const { data: enrollments = [], isLoading } = useInstanceEnrollments(instanceId);
  const updateApproval = useUpdateEnrollmentApproval();
  const { toast } = useToast();
  const [search, setSearch] = useState('');

  if (isLoading) return <PageLoading text="加载学员列表..." />;

  const filtered = (enrollments as any[]).filter((e) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (e.user?.name || '').toLowerCase().includes(q) ||
      (e.user?.email || '').toLowerCase().includes(q)
    );
  });

  const handleApproval = (enrollmentId: string, approvalStatus: string) => {
    updateApproval.mutate(
      { instanceId, enrollmentId, approvalStatus },
      {
        onSuccess: () => {
          toast(approvalStatus === 'approved' ? '已通过' : '已拒绝', 'success');
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索学员姓名或邮箱..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="px-4 py-3 font-medium">姓名</th>
                <th className="px-4 py-3 font-medium">邮箱</th>
                <th className="px-4 py-3 font-medium">来源</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">审核</th>
                <th className="px-4 py-3 font-medium">报名日期</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    暂无学员
                  </td>
                </tr>
              ) : (
                filtered.map((e: any) => {
                  const es = enrollStatusLabels[e.status] || enrollStatusLabels.enrolled;
                  const ap = approvalLabels[e.approvalStatus] || approvalLabels.pending;
                  return (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-800 font-medium">
                        {e.user?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{e.user?.email || '-'}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {sourceLabels[e.source] || e.source || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${es.color}`}>
                          {es.text}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ap.color}`}>
                          {ap.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {e.enrolledAt ? new Date(e.enrolledAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {e.approvalStatus === 'pending' && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleApproval(e.id, 'approved')}
                              className="p-1.5 rounded-lg text-green-600 hover:bg-green-50"
                              title="通过"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleApproval(e.id, 'rejected')}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                              title="拒绝"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 3: Progress ──────────────────────────────────────────

function ProgressTab({ instanceId, instance }: { instanceId: string; instance: any }) {
  const { data: enrollments = [], isLoading } = useInstanceEnrollments(instanceId);

  if (isLoading) return <PageLoading text="加载进度数据..." />;

  const chapters: any[] = instance.course?.chapters || [];
  const students = (enrollments as any[]).filter(
    (e) => e.status === 'enrolled' || e.status === 'completed',
  );

  if (chapters.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
        暂无章节数据
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-500">
              <th className="px-4 py-3 font-medium sticky left-0 bg-slate-50 z-10 min-w-[120px]">
                学员
              </th>
              {chapters.map((ch: any) => (
                <th
                  key={ch.id || ch._id}
                  className="px-3 py-3 font-medium text-center min-w-[80px]"
                  title={ch.title}
                >
                  <span className="truncate block max-w-[80px]">{ch.title}</span>
                </th>
              ))}
              <th className="px-4 py-3 font-medium text-center min-w-[80px]">完成率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.length === 0 ? (
              <tr>
                <td
                  colSpan={chapters.length + 2}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  暂无学员
                </td>
              </tr>
            ) : (
              students.map((s: any) => {
                const completedChapterIds = new Set(
                  (s.completedChapters || []).map((c: any) =>
                    typeof c === 'string' ? c : c.chapterId || c.id || c._id,
                  ),
                );
                const completedCount = chapters.filter((ch) =>
                  completedChapterIds.has(ch.id || ch._id),
                ).length;
                const pct = chapters.length > 0 ? Math.round((completedCount / chapters.length) * 100) : 0;

                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800 font-medium sticky left-0 bg-white z-10">
                      {s.user?.name || '-'}
                    </td>
                    {chapters.map((ch: any) => {
                      const chId = ch.id || ch._id;
                      const done = completedChapterIds.has(chId);
                      return (
                        <td key={chId} className="px-3 py-3 text-center">
                          {done ? (
                            <Check className="w-4 h-4 text-green-500 mx-auto" />
                          ) : (
                            <span className="text-slate-200">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          pct === 100
                            ? 'bg-green-50 text-green-600'
                            : pct > 0
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-slate-50 text-slate-400'
                        }`}
                      >
                        {pct}%
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab 4: Feedback & Homework ───────────────────────────────

function FeedbackHomeworkTab({ instanceId }: { instanceId: string }) {
  return (
    <div className="space-y-8">
      <FeedbackSection instanceId={instanceId} />
      <HomeworkSection instanceId={instanceId} />
    </div>
  );
}

// ─── Feedback Section ─────────────────────────────────────────

function FeedbackSection({ instanceId }: { instanceId: string }) {
  const { data: forms = [], isLoading } = useFeedbackForms(instanceId);
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null);

  if (isLoading) return <PageLoading text="加载反馈数据..." />;

  return (
    <div>
      <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <MessageSquare className="w-4 h-4" />
        反馈
      </h3>
      {(forms as any[]).length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-400 text-sm">
          暂无反馈表单
        </div>
      ) : (
        <div className="space-y-3">
          {(forms as any[]).map((form: any) => (
            <FeedbackFormCard
              key={form.id || form._id}
              instanceId={instanceId}
              form={form}
              expanded={expandedFormId === (form.id || form._id)}
              onToggle={() =>
                setExpandedFormId(
                  expandedFormId === (form.id || form._id) ? null : form.id || form._id,
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackFormCard({
  instanceId,
  form,
  expanded,
  onToggle,
}: {
  instanceId: string;
  form: any;
  expanded: boolean;
  onToggle: () => void;
}) {
  const formId = form.id || form._id;
  const { data: responses = [], isLoading } = useFeedbackResponses(
    instanceId,
    expanded ? formId : null,
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-3 text-left">
          <MessageSquare className="w-4 h-4 text-slate-400" />
          <div>
            <p className="text-sm font-medium text-slate-800">
              {form.chapterTitle || form.title || '反馈表单'}
            </p>
            <p className="text-xs text-slate-400">
              {form.responseCount ?? (responses as any[]).length} 条回复
            </p>
          </div>
        </div>
        <span className="text-slate-400 text-xs">{expanded ? '收起' : '展开'}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4">
          {isLoading ? (
            <p className="text-sm text-slate-400">加载中...</p>
          ) : (responses as any[]).length === 0 ? (
            <p className="text-sm text-slate-400">暂无回复</p>
          ) : (
            <div className="space-y-3">
              {(responses as any[]).map((r: any, idx: number) => (
                <div
                  key={r.id || r._id || idx}
                  className="bg-slate-50 rounded-lg p-3 space-y-2"
                >
                  <p className="text-xs text-slate-500 font-medium">
                    {r.user?.name || `回复 ${idx + 1}`}
                    {r.submittedAt && (
                      <span className="ml-2 text-slate-400">
                        {new Date(r.submittedAt).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                  {(r.answers || []).map((a: any, aIdx: number) => (
                    <div key={aIdx} className="text-sm">
                      <p className="text-slate-500 text-xs">{a.question || `问题 ${aIdx + 1}`}</p>
                      <p className="text-slate-700">{a.answer ?? a.value ?? '-'}</p>
                    </div>
                  ))}
                  {!r.answers && r.content && (
                    <p className="text-sm text-slate-700">{r.content}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Homework Section ─────────────────────────────────────────

function HomeworkSection({ instanceId }: { instanceId: string }) {
  const { data: defs = [], isLoading } = useHomeworkDefs(instanceId);
  const [expandedDefId, setExpandedDefId] = useState<string | null>(null);

  if (isLoading) return <PageLoading text="加载作业数据..." />;

  return (
    <div>
      <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <BookOpen className="w-4 h-4" />
        作业
      </h3>
      {(defs as any[]).length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-400 text-sm">
          暂无作业
        </div>
      ) : (
        <div className="space-y-3">
          {(defs as any[]).map((def: any) => (
            <HomeworkDefCard
              key={def.id || def._id}
              instanceId={instanceId}
              def={def}
              expanded={expandedDefId === (def.id || def._id)}
              onToggle={() =>
                setExpandedDefId(
                  expandedDefId === (def.id || def._id) ? null : def.id || def._id,
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HomeworkDefCard({
  instanceId,
  def,
  expanded,
  onToggle,
}: {
  instanceId: string;
  def: any;
  expanded: boolean;
  onToggle: () => void;
}) {
  const defId = def.id || def._id;
  const { data: submissions = [], isLoading } = useHomeworkSubmissions(
    instanceId,
    expanded ? defId : null,
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-3 text-left">
          <BookOpen className="w-4 h-4 text-slate-400" />
          <div>
            <p className="text-sm font-medium text-slate-800">
              {def.chapterTitle || def.title || '作业'}
            </p>
            <p className="text-xs text-slate-400">
              {def.submissionCount ?? (submissions as any[]).length} 份提交
            </p>
          </div>
        </div>
        <span className="text-slate-400 text-xs">{expanded ? '收起' : '展开'}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4">
          {isLoading ? (
            <p className="text-sm text-slate-400">加载中...</p>
          ) : (submissions as any[]).length === 0 ? (
            <p className="text-sm text-slate-400">暂无提交</p>
          ) : (
            <div className="space-y-3">
              {(submissions as any[]).map((sub: any, idx: number) => (
                <SubmissionItem
                  key={sub.id || sub._id || idx}
                  instanceId={instanceId}
                  defId={defId}
                  submission={sub}
                  idx={idx}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubmissionItem({
  instanceId,
  defId,
  submission,
  idx,
}: {
  instanceId: string;
  defId: string;
  submission: any;
  idx: number;
}) {
  const reviewHomework = useReviewHomework();
  const { toast } = useToast();
  const [reviewing, setReviewing] = useState(false);
  const [comment, setComment] = useState('');

  const subId = submission.id || submission._id;

  const handleReview = () => {
    if (!comment.trim()) return;
    reviewHomework.mutate(
      {
        instanceId,
        defId,
        submissionId: subId,
        comment,
        status: 'reviewed',
      },
      {
        onSuccess: () => {
          toast('批阅成功', 'success');
          setReviewing(false);
          setComment('');
        },
      },
    );
  };

  const statusMap: Record<string, { text: string; color: string }> = {
    submitted: { text: '已提交', color: 'text-yellow-600 bg-yellow-50' },
    reviewed: { text: '已批阅', color: 'text-green-600 bg-green-50' },
  };
  const ss = statusMap[submission.status] || statusMap.submitted;

  return (
    <div className="bg-slate-50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium">
          {submission.user?.name || `学员 ${idx + 1}`}
          {submission.submittedAt && (
            <span className="ml-2 text-slate-400">
              {new Date(submission.submittedAt).toLocaleDateString()}
            </span>
          )}
        </p>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ss.color}`}>
          {ss.text}
        </span>
      </div>

      {/* Content */}
      {submission.content && <p className="text-sm text-slate-700">{submission.content}</p>}
      {submission.selectedOptions && submission.selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {submission.selectedOptions.map((opt: string, i: number) => (
            <span
              key={i}
              className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full"
            >
              {opt}
            </span>
          ))}
        </div>
      )}

      {/* Review comment (if already reviewed) */}
      {submission.comment && (
        <div className="bg-white rounded-lg p-2 border border-slate-200">
          <p className="text-xs text-slate-400 mb-0.5">批阅意见</p>
          <p className="text-sm text-slate-700">{submission.comment}</p>
        </div>
      )}

      {/* Review action */}
      {submission.status === 'submitted' && !reviewing && (
        <button
          onClick={() => setReviewing(true)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-500 font-medium"
        >
          <Eye className="w-3.5 h-3.5" />
          批阅
        </button>
      )}
      {reviewing && (
        <div className="space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="输入批阅意见..."
            className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
          />
          <div className="flex gap-2">
            <button
              onClick={handleReview}
              disabled={reviewHomework.isPending || !comment.trim()}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50"
            >
              {reviewHomework.isPending ? '提交中...' : '提交批阅'}
            </button>
            <button
              onClick={() => {
                setReviewing(false);
                setComment('');
              }}
              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

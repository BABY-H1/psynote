import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAvailableGroups, useAvailableCourses } from '../../../api/useClientPortal';
import { useEnrollInGroup } from '../../../api/useGroups';
import { useEnrollInCourse } from '../../../api/useCourses';
import { PageLoading, EmptyState, useToast } from '../../../shared/components';
import {
  Users, MapPin, Calendar, Clock, Target, BookOpen,
  ChevronRight, CheckCircle2, AlertCircle, X,
} from 'lucide-react';

export function ServiceHall() {
  const { data: groups, isLoading: groupsLoading } = useAvailableGroups();
  const { data: courses, isLoading: coursesLoading } = useAvailableCourses();
  const enrollCourse = useEnrollInCourse();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [detailGroup, setDetailGroup] = useState<any>(null);

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-bold text-slate-900">服务大厅</h2>

      {/* Appointment booking entry */}
      <section>
        <div className="bg-gradient-to-r from-brand-50 to-brand-100 rounded-xl border border-brand-200 p-6 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-brand-900 mb-1">预约咨询</h3>
            <p className="text-sm text-brand-700">选择咨询师和时间，在线预约一对一心理咨询</p>
          </div>
          <button
            onClick={() => navigate('/portal/book')}
            className="px-6 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 flex-shrink-0"
          >
            立即预约
          </button>
        </div>
      </section>

      {/* Groups */}
      <section>
        <h3 className="font-semibold text-slate-900 mb-3">团体辅导活动</h3>
        {groupsLoading ? (
          <PageLoading />
        ) : !groups || groups.length === 0 ? (
          <EmptyState title="暂无可参加的团辅活动" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {groups.map((g: any) => {
              const isFull = g.spotsLeft !== null && g.spotsLeft <= 0;
              const alreadyEnrolled = !!g.myEnrollmentStatus;
              return (
                <button
                  key={g.id}
                  onClick={() => setDetailGroup(g)}
                  className="text-left bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm hover:border-slate-300 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 mb-1">{g.title}</h4>
                      {g.scheme?.targetAudience && (
                        <span className="text-xs px-2 py-0.5 bg-violet-50 text-violet-600 rounded-full">
                          {g.scheme.targetAudience}
                        </span>
                      )}
                    </div>
                    {alreadyEnrolled ? (
                      <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full flex-shrink-0">
                        {g.myEnrollmentStatus === 'approved' ? '已入组'
                          : g.myEnrollmentStatus === 'pending' ? '待审核'
                          : g.myEnrollmentStatus === 'waitlisted' ? '等候中'
                          : g.myEnrollmentStatus}
                      </span>
                    ) : isFull ? (
                      <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full flex-shrink-0">已满</span>
                    ) : null}
                  </div>

                  {g.description && (
                    <p className="text-sm text-slate-500 line-clamp-2 mt-2">{g.description}</p>
                  )}

                  <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-3">
                    {g.startDate && (
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {g.startDate}</span>
                    )}
                    {g.location && (
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {g.location}</span>
                    )}
                    {g.capacity && (
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {g.approvedCount || 0}/{g.capacity}
                      </span>
                    )}
                    {g.scheme?.totalSessions && (
                      <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {g.scheme.totalSessions}次</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-xs text-brand-500 mt-3">
                    查看详情 <ChevronRight className="w-3 h-3" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Courses */}
      <section>
        <h3 className="font-semibold text-slate-900 mb-3">课程学习</h3>
        {coursesLoading ? (
          <PageLoading />
        ) : !courses || courses.length === 0 ? (
          <EmptyState title="暂无可学习的课程" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <h4 className="font-semibold text-slate-900 text-sm mb-1">{c.title}</h4>
                {c.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mb-3">{c.description}</p>
                )}
                <div className="flex items-center justify-between">
                  {c.category && <span className="text-xs text-slate-400">{c.category}</span>}
                  <button
                    onClick={async () => {
                      await enrollCourse.mutateAsync({ courseId: c.id }).catch(() => {/* already enrolled */});
                      navigate(`/portal/courses/${c.id}`);
                    }}
                    disabled={enrollCourse.isPending}
                    className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 disabled:opacity-50"
                  >
                    开始学习
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Group Detail Modal */}
      {detailGroup && (
        <GroupDetailModal group={detailGroup} onClose={() => setDetailGroup(null)} />
      )}
    </div>
  );
}

function GroupDetailModal({ group, onClose }: { group: any; onClose: () => void }) {
  const enrollGroup = useEnrollInGroup();
  const { toast } = useToast();

  const isFull = group.spotsLeft !== null && group.spotsLeft <= 0;
  const alreadyEnrolled = !!group.myEnrollmentStatus;

  const handleEnroll = () => {
    enrollGroup.mutate({ instanceId: group.id }, {
      onSuccess: () => {
        toast(isFull ? '已加入等候列表' : '报名成功，等待审批', 'success');
        onClose();
      },
      onError: () => toast('报名失败', 'error'),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 p-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{group.title}</h2>
            {group.scheme?.targetAudience && (
              <span className="text-xs text-violet-600">{group.scheme.targetAudience}</span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {group.description && (
            <p className="text-sm text-slate-600 leading-relaxed">{group.description}</p>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {group.startDate && (
              <InfoItem icon={<Calendar className="w-4 h-4 text-blue-500" />} label="开始日期" value={group.startDate} />
            )}
            {group.location && (
              <InfoItem icon={<MapPin className="w-4 h-4 text-green-500" />} label="地点" value={group.location} />
            )}
            {group.schedule && (
              <InfoItem icon={<Clock className="w-4 h-4 text-amber-500" />} label="时间安排" value={group.schedule} />
            )}
            {group.spotsLeft !== null && (
              <InfoItem
                icon={<Users className="w-4 h-4 text-violet-500" />}
                label="剩余名额"
                value={group.spotsLeft > 0 ? `${group.spotsLeft} 个` : '已满'}
              />
            )}
          </div>

          {/* Scheme info */}
          {group.scheme && (
            <div className="bg-violet-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-semibold text-violet-900">活动方案</span>
              </div>

              {group.scheme.overallGoal && (
                <div>
                  <span className="text-xs text-violet-500">目标</span>
                  <p className="text-sm text-violet-800">{group.scheme.overallGoal}</p>
                </div>
              )}

              {group.scheme.theory && (
                <div>
                  <span className="text-xs text-violet-500">理论基础</span>
                  <p className="text-sm text-violet-700">{group.scheme.theory}</p>
                </div>
              )}

              <div className="flex gap-4 pt-2 border-t border-violet-100">
                {group.scheme.totalSessions && (
                  <div>
                    <p className="text-lg font-bold text-violet-900">{group.scheme.totalSessions}</p>
                    <p className="text-xs text-violet-500">总次数</p>
                  </div>
                )}
                {group.scheme.sessionDuration && (
                  <div>
                    <p className="text-lg font-bold text-violet-900">{group.scheme.sessionDuration}</p>
                    <p className="text-xs text-violet-500">每次时长</p>
                  </div>
                )}
                {group.scheme.frequency && (
                  <div>
                    <p className="text-lg font-bold text-violet-900">{group.scheme.frequency}</p>
                    <p className="text-xs text-violet-500">频率</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer action */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 p-5">
          {alreadyEnrolled ? (
            <div className="flex items-center gap-2 justify-center text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              {group.myEnrollmentStatus === 'approved' ? '您已入组'
                : group.myEnrollmentStatus === 'pending' ? '您的申请正在审核中'
                : group.myEnrollmentStatus === 'waitlisted' ? '您在等候列表中'
                : `状态: ${group.myEnrollmentStatus}`}
            </div>
          ) : (
            <button
              onClick={handleEnroll}
              disabled={enrollGroup.isPending}
              className={`w-full py-3 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                isFull
                  ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                  : 'bg-brand-600 text-white hover:bg-brand-500'
              }`}
            >
              {enrollGroup.isPending ? '提交中...' : isFull ? '加入等候列表' : '立即报名'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm text-slate-700">{value}</p>
      </div>
    </div>
  );
}

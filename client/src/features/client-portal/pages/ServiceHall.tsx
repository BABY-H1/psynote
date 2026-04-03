import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAvailableGroups, useAvailableCourses } from '../../../api/useClientPortal';
import { useEnrollInGroup } from '../../../api/useGroups';
import { useEnrollInCourse } from '../../../api/useCourses';
import { PageLoading, EmptyState } from '../../../shared/components';

export function ServiceHall() {
  const { data: groups, isLoading: groupsLoading } = useAvailableGroups();
  const { data: courses, isLoading: coursesLoading } = useAvailableCourses();
  const enrollGroup = useEnrollInGroup();
  const enrollCourse = useEnrollInCourse();
  const navigate = useNavigate();

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
            {groups.map((g) => (
              <div key={g.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <h4 className="font-semibold text-slate-900 mb-1">{g.title}</h4>
                {g.description && (
                  <p className="text-sm text-slate-500 line-clamp-2 mb-3">{g.description}</p>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex gap-3 text-xs text-slate-400">
                    {g.startDate && <span>{g.startDate}</span>}
                    {g.location && <span>{g.location}</span>}
                  </div>
                  <button
                    onClick={() => enrollGroup.mutate({ instanceId: g.id })}
                    disabled={enrollGroup.isPending}
                    className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 disabled:opacity-50"
                  >
                    报名
                  </button>
                </div>
              </div>
            ))}
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
    </div>
  );
}

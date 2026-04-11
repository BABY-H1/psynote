import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ClipboardList, CheckCircle2 } from 'lucide-react';
import { useMyAppointments, useAvailableGroups, useAvailableCourses, useMyAssessments } from '@client/api/useClientPortal';
import { PageLoading } from '@client/shared/components';
import { ServiceCard } from '../components/ServiceCard';
import { SectionHeader } from '../components/SectionHeader';

/**
 * Phase 8c — MyServicesTab: unified "my services" landing page.
 *
 * Three sections stacked vertically, each showing only the services the
 * client is actively involved in:
 *
 *   我的咨询    — distinct counselors from useMyAppointments, upcoming + history
 *   我的团辅    — groups where myEnrollmentStatus='approved' (from useAvailableGroups)
 *   我的课程    — courses where myEnrollmentStatus='enrolled' or similar
 *
 * ---
 *
 * NOTE ON DATA REUSE:
 *
 * Phase 8a baseline inventory revealed that the portal doesn't have a pure
 * "my services" endpoint. Instead:
 *
 *   - useMyAppointments()    returns the client's appointment history; we
 *                            derive "my counseling" from the unique counselor
 *                            IDs that appear in it.
 *   - useAvailableGroups()   returns all enrollable groups PLUS a
 *                            `myEnrollmentStatus` annotation when the client
 *                            is already involved. We filter to the rows where
 *                            that annotation is set.
 *   - useAvailableCourses()  same pattern for courses.
 *
 * A proper `/client/my-services` endpoint would be simpler and cheaper, but
 * Phase 8c's promise was "zero server changes". The filtering done here
 * gives us the right output on existing endpoints.
 *
 * CourseReader enrollmentId bug fix: when we navigate to
 * /portal/services/course/:courseId we pass the enrollmentId through the
 * route state so CourseReader can record progress properly. That was the
 * bug identified during Phase 8a baseline — it was hardcoded to null.
 */

export function MyServicesTab() {
  const navigate = useNavigate();
  const { data: appointments, isLoading: apptLoading } = useMyAppointments();
  const { data: groups, isLoading: groupsLoading } = useAvailableGroups();
  const { data: courses, isLoading: coursesLoading } = useAvailableCourses();
  const { data: myAssessments } = useMyAssessments();

  // "My counseling" = distinct counselors from the appointments list. For
  // each counselor, we also compute the next upcoming appointment (if any).
  const myCounseling = useMemo(() => {
    if (!appointments) return [];
    const byCounselor = new Map<
      string,
      {
        counselorId: string;
        counselorName?: string;
        nextAppointment?: any;
        totalAppointments: number;
      }
    >();
    const now = Date.now();
    for (const apt of appointments) {
      const cId = (apt as any).counselorId || (apt as any).counselor?.id;
      if (!cId) continue;
      let bucket = byCounselor.get(cId);
      if (!bucket) {
        bucket = {
          counselorId: cId,
          counselorName: (apt as any).counselor?.name,
          totalAppointments: 0,
        };
        byCounselor.set(cId, bucket);
      }
      bucket.totalAppointments++;
      const ts = new Date(apt.startTime).getTime();
      if (ts >= now) {
        // Keep the earliest upcoming
        if (
          !bucket.nextAppointment ||
          ts < new Date(bucket.nextAppointment.startTime).getTime()
        ) {
          bucket.nextAppointment = apt;
        }
      }
    }
    return Array.from(byCounselor.values());
  }, [appointments]);

  // "My groups" = groups where I'm approved / pending / waitlisted
  const myGroups = useMemo(() => {
    if (!groups) return [];
    return (groups as any[]).filter((g) => !!g.myEnrollmentStatus);
  }, [groups]);

  // "My courses" — /client/my-courses returns { enrollment, courseTitle, courseCategory }[]
  const myCourses = useMemo(() => {
    if (!courses) return [];
    return (courses as any[]).map((c) => {
      // Handle both old shape (flat course object) and new shape (enrollment wrapper)
      if (c.enrollment) {
        return {
          id: c.enrollment.courseId,
          instanceId: c.enrollment.instanceId,
          enrollmentId: c.enrollment.id,
          title: c.courseTitle || '课程',
          description: null,
          status: c.enrollment.status,
          progress: c.enrollment.progress,
        };
      }
      // Fallback: legacy flat shape
      if (c.myEnrollmentStatus || c.enrollmentId || c.enrolled) return c;
      return null;
    }).filter(Boolean);
  }, [courses]);

  if (apptLoading || groupsLoading || coursesLoading) {
    return <PageLoading />;
  }

  const hasAny = myCounseling.length > 0 || myGroups.length > 0 || myCourses.length > 0;

  return (
    <div className="space-y-8">
      {!hasAny && (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center bg-white">
          <div className="text-sm font-medium text-slate-500">暂无进行中的服务</div>
          <div className="text-xs text-slate-400 mt-1">
            咨询师或机构为你安排服务后，会在这里出现
          </div>
        </div>
      )}

      {/* 我的咨询 */}
      {myCounseling.length > 0 && (
        <section>
          <SectionHeader title="我的咨询" count={myCounseling.length} />
          <div className="space-y-2">
            {myCounseling.map((item) => (
              <ServiceCard
                key={item.counselorId}
                kind="counseling"
                title={item.counselorName || '我的咨询师'}
                badge={
                  item.nextAppointment
                    ? { text: '已预约', tone: 'blue' }
                    : undefined
                }
                meta={
                  item.nextAppointment ? (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      下次: {formatAppointmentTime(item.nextAppointment.startTime)}
                    </span>
                  ) : (
                    <span>共 {item.totalAppointments} 次预约 · 暂无下次</span>
                  )
                }
                onClick={() =>
                  navigate(`/portal/services/counseling/${item.counselorId}`)
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* 我的团辅 */}
      {myGroups.length > 0 && (
        <section>
          <SectionHeader title="我的团辅" count={myGroups.length} />
          <div className="space-y-2">
            {myGroups.map((g: any) => {
              const statusMap: Record<string, { text: string; tone: 'green' | 'amber' | 'slate' }> = {
                approved: { text: '已入组', tone: 'green' },
                pending: { text: '待审核', tone: 'amber' },
                waitlisted: { text: '等候中', tone: 'slate' },
              };
              const status = statusMap[g.myEnrollmentStatus] ?? { text: g.myEnrollmentStatus, tone: 'slate' };
              return (
                <ServiceCard
                  key={g.id}
                  kind="group"
                  title={g.title}
                  description={g.description}
                  badge={status}
                  meta={
                    g.startDate ? (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {g.startDate}
                        {g.location ? ` · ${g.location}` : ''}
                      </span>
                    ) : undefined
                  }
                  onClick={() => navigate(`/portal/services/group/${g.id}`)}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* 我的量表 */}
      {myAssessments && myAssessments.length > 0 && (
        <section>
          <SectionHeader title="我的量表" count={myAssessments.length} />
          <div className="space-y-2">
            {myAssessments.map((a: any) => (
              <button
                key={a.id}
                onClick={() => {
                  if (!a.completed) window.open(a.runnerUrl, '_blank');
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition ${
                  a.completed
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-slate-200 hover:border-brand-300'
                }`}
              >
                {a.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                ) : (
                  <ClipboardList className="w-5 h-5 text-brand-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${a.completed ? 'text-green-700' : 'text-slate-900'}`}>
                    {a.title}
                  </div>
                  {a.context && (
                    <div className="text-xs text-slate-400 mt-0.5">
                      来自：{a.context.instanceTitle}
                    </div>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  a.completed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {a.completed ? '已完成' : '待填写'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 我的课程 */}
      {myCourses.length > 0 && (
        <section>
          <SectionHeader title="��的课程" count={myCourses.length} />
          <div className="space-y-2">
            {myCourses.map((c: any) => {
              const total = c.chapterCount ?? c.chapters?.length ?? 0;
              const done = c.completedChapters ?? 0;
              return (
                <ServiceCard
                  key={c.id}
                  kind="course"
                  title={c.title}
                  description={c.description}
                  meta={
                    total > 0 ? `进度 ${done}/${total}` : '开始学习'
                  }
                  onClick={() => {
                    // Pass enrollmentId through route state so CourseReader
                    // can track progress properly (Phase 8a bug fix).
                    navigate(`/portal/services/course/${c.id}`, {
                      state: { enrollmentId: c.enrollmentId ?? null },
                    });
                  }}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function formatAppointmentTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.floor(diff / 86400000);
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `今天 ${time}`;
  if (days === 1) return `明天 ${time}`;
  if (days < 7) return `${days}天后 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

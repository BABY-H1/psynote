import React, { useState } from 'react';
import {
  useGroupSessions, useInitializeSessions, useCreateSessionRecord,
  useUpdateSessionRecord, useRecordAttendance,
} from '../../../../api/useGroups';
import { PageLoading, EmptyState, useToast } from '../../../../shared/components';
import {
  CheckCircle2, Circle, XCircle, Plus, Download, Calendar,
  ChevronDown, ChevronRight, Users, FileText,
} from 'lucide-react';
import type { GroupInstance, GroupEnrollment } from '@psynote/shared';

const sessionStatusConfig: Record<string, { icon: React.ReactNode; color: string; text: string }> = {
  planned: { icon: <Circle className="w-4 h-4" />, color: 'text-slate-400', text: '计划中' },
  completed: { icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-green-500', text: '已完成' },
  cancelled: { icon: <XCircle className="w-4 h-4" />, color: 'text-red-400', text: '已取消' },
};

const attendanceLabels: Record<string, string> = {
  present: '到',
  absent: '缺',
  excused: '假',
  late: '迟',
};

interface Props {
  instance: GroupInstance & { enrollments: (GroupEnrollment & { user: { name: string; email: string } })[] };
}

export function SessionsTab({ instance }: Props) {
  const { data: sessions, isLoading } = useGroupSessions(instance.id);
  const initSessions = useInitializeSessions();
  const updateSession = useUpdateSessionRecord();
  const recordAttendance = useRecordAttendance();
  const { toast } = useToast();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attendanceModalId, setAttendanceModalId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  if (isLoading) return <PageLoading />;

  const completedCount = sessions?.filter((s) => s.status === 'completed').length || 0;
  const totalCount = sessions?.length || 0;

  const handleInitialize = () => {
    initSessions.mutate(instance.id, {
      onSuccess: () => toast('活动单元已从方案导入', 'success'),
      onError: (err: any) => toast(err?.message || '初始化失败', 'error'),
    });
  };

  const handleStatusChange = (sessionId: string, status: string) => {
    updateSession.mutate({ instanceId: instance.id, sessionId, status }, {
      onSuccess: () => toast(status === 'completed' ? '已标记完成' : '状态已更新', 'success'),
    });
  };

  const handleNotesChange = (sessionId: string, notes: string) => {
    updateSession.mutate({ instanceId: instance.id, sessionId, notes });
  };

  // Approved enrollments for attendance
  const approvedEnrollments = (instance.enrollments || []).filter((e) => e.status === 'approved');

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      {totalCount > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">活动进度</span>
            <span className="text-sm text-slate-500">{completedCount}/{totalCount} 次已完成</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {instance.schemeId && (!sessions || sessions.length === 0) && (
          <button
            onClick={handleInitialize}
            disabled={initSessions.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {initSessions.isPending ? '导入中...' : '从方案导入活动'}
          </button>
        )}
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50"
        >
          <Plus className="w-4 h-4" /> 新增活动
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <AddSessionForm
          instanceId={instance.id}
          nextNumber={(sessions?.length || 0) + 1}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {/* Session Timeline */}
      {!sessions || sessions.length === 0 ? (
        <EmptyState title="暂无活动记录" />
      ) : (
        <div className="space-y-3">
          {sessions.map((sess) => {
            const config = sessionStatusConfig[sess.status] || sessionStatusConfig.planned;
            const isExpanded = expandedId === sess.id;

            return (
              <div key={sess.id} className={`bg-white rounded-xl border border-slate-200 transition ${
                sess.status === 'cancelled' ? 'opacity-60' : ''
              }`}>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={config.color}>{config.icon}</span>
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">
                        {sess.sessionNumber}
                      </span>
                      <div>
                        <span className={`text-sm font-medium ${
                          sess.status === 'cancelled' ? 'line-through text-slate-400' : 'text-slate-900'
                        }`}>{sess.title}</span>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                          {sess.date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {sess.date}
                            </span>
                          )}
                          {sess.status === 'completed' && sess.attendanceCount !== undefined && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" /> 出勤 {sess.attendanceCount}人
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {sess.status === 'planned' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(sess.id, 'completed')}
                            className="text-xs px-2.5 py-1 bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
                          >
                            标记完成
                          </button>
                          <button
                            onClick={() => handleStatusChange(sess.id, 'cancelled')}
                            className="text-xs px-2.5 py-1 text-slate-400 rounded-lg hover:bg-slate-100"
                          >
                            取消
                          </button>
                        </>
                      )}
                      {sess.status === 'completed' && (
                        <button
                          onClick={() => setAttendanceModalId(sess.id)}
                          className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-1"
                        >
                          <Users className="w-3 h-3" /> 签到
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : sess.id)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded: Notes */}
                {isExpanded && (
                  <div className="border-t border-slate-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-slate-400">活动笔记</span>
                    </div>
                    <textarea
                      defaultValue={sess.notes || ''}
                      onBlur={(e) => {
                        if (e.target.value !== (sess.notes || '')) {
                          handleNotesChange(sess.id, e.target.value);
                        }
                      }}
                      rows={3}
                      placeholder="记录本次活动的观察和反思..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Attendance Modal */}
      {attendanceModalId && (
        <AttendanceModal
          sessionId={attendanceModalId}
          instanceId={instance.id}
          enrollments={approvedEnrollments}
          onClose={() => setAttendanceModalId(null)}
        />
      )}
    </div>
  );
}

function AddSessionForm({ instanceId, nextNumber, onClose }: {
  instanceId: string; nextNumber: number; onClose: () => void;
}) {
  const createSession = useCreateSessionRecord();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createSession.mutate({ instanceId, title, sessionNumber: nextNumber, date: date || undefined }, {
      onSuccess: () => { toast('活动已添加', 'success'); onClose(); },
      onError: () => toast('添加失败', 'error'),
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h4 className="text-sm font-semibold text-slate-900 mb-3">新增活动 (第 {nextNumber} 次)</h4>
      <form onSubmit={handleSubmit} className="flex gap-3 items-end">
        <div className="flex-1">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required
            placeholder="活动标题"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <button type="submit" disabled={!title || createSession.isPending}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50">
          添加
        </button>
        <button type="button" onClick={onClose}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
          取消
        </button>
      </form>
    </div>
  );
}

function AttendanceModal({ sessionId, instanceId, enrollments, onClose }: {
  sessionId: string;
  instanceId: string;
  enrollments: (GroupEnrollment & { user: { name: string; email: string } })[];
  onClose: () => void;
}) {
  const recordAttendance = useRecordAttendance();
  const { toast } = useToast();
  const [records, setRecords] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    enrollments.forEach((e) => { init[e.id] = 'present'; });
    return init;
  });

  const handleSave = () => {
    const attendances = Object.entries(records).map(([enrollmentId, status]) => ({
      enrollmentId,
      status,
    }));
    recordAttendance.mutate({ instanceId, sessionId, attendances }, {
      onSuccess: () => { toast('签到记录已保存', 'success'); onClose(); },
      onError: () => toast('保存失败', 'error'),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
        <h3 className="font-semibold text-slate-900 mb-4">签到记录</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
          {enrollments.map((e) => (
            <div key={e.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm font-medium text-slate-900">{e.user?.name || '未知'}</span>
              <div className="flex gap-1">
                {(['present', 'late', 'excused', 'absent'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setRecords((prev) => ({ ...prev, [e.id]: status }))}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      records[e.id] === status
                        ? status === 'present' ? 'bg-green-600 text-white'
                        : status === 'late' ? 'bg-yellow-500 text-white'
                        : status === 'excused' ? 'bg-blue-500 text-white'
                        : 'bg-red-500 text-white'
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    {attendanceLabels[status]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            取消
          </button>
          <button onClick={handleSave} disabled={recordAttendance.isPending}
            className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50">
            {recordAttendance.isPending ? '保存中...' : '保存签到'}
          </button>
        </div>
      </div>
    </div>
  );
}

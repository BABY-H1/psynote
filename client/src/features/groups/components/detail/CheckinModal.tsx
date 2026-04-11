import React, { useState } from 'react';
import { useSessionAttendance, useRecordAttendance } from '../../../../api/useGroups';
import { useToast } from '../../../../shared/components';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, RefreshCw, Users } from 'lucide-react';
import type { GroupEnrollment } from '@psynote/shared';

const attendanceLabels: Record<string, { label: string; color: string }> = {
  present: { label: '到', color: 'bg-green-600 text-white' },
  late: { label: '迟', color: 'bg-yellow-500 text-white' },
  excused: { label: '假', color: 'bg-blue-500 text-white' },
  absent: { label: '缺', color: 'bg-red-500 text-white' },
};

interface Props {
  instanceId: string;
  sessionId: string;
  sessionTitle: string;
  enrollments: (GroupEnrollment & { user: { name: string; email: string } })[];
  onClose: () => void;
}

export function CheckinModal({ instanceId, sessionId, sessionTitle, enrollments, onClose }: Props) {
  const checkinUrl = `${window.location.origin}/checkin/${instanceId}/${sessionId}`;
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const recordAttendance = useRecordAttendance();

  // Poll for attendance data every 5 seconds
  const { data: sessionData, refetch } = useSessionAttendance(instanceId, sessionId, 5000);

  // Build attendance map from polled data
  const attendanceMap = new Map<string, string>();
  if (sessionData?.attendance) {
    for (const att of sessionData.attendance) {
      attendanceMap.set(att.enrollmentId, att.status);
    }
  }

  const approvedEnrollments = enrollments.filter((e) => e.status === 'approved');
  const checkedInCount = approvedEnrollments.filter((e) => attendanceMap.has(e.id)).length;

  // Local state for manual changes
  const [localStatus, setLocalStatus] = useState<Record<string, string>>({});

  const getStatus = (enrollmentId: string): string | undefined => {
    return localStatus[enrollmentId] || attendanceMap.get(enrollmentId);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(checkinUrl);
    setCopied(true);
    toast('签到链接已复制', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveAttendance = () => {
    // Only save entries that have local changes
    const entries = Object.entries(localStatus);
    if (entries.length === 0) {
      toast('没有需要保存的更改', 'info' as any);
      return;
    }

    const attendances = entries.map(([enrollmentId, status]) => ({
      enrollmentId,
      status,
    }));

    recordAttendance.mutate({ instanceId, sessionId, attendances }, {
      onSuccess: () => {
        toast('签到记录已保存', 'success');
        setLocalStatus({});
        refetch();
      },
      onError: () => toast('保存失败', 'error'),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="font-semibold text-slate-900">签到管理</h3>
            <p className="text-xs text-slate-400 mt-0.5">{sessionTitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* QR Code Section */}
          <div className="flex items-start gap-6">
            <div className="shrink-0">
              <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                <QRCodeSVG value={checkinUrl} size={160} level="M" />
              </div>
              <p className="text-xs text-slate-400 text-center mt-2">扫码签到</p>
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">签到链接</label>
                <div className="flex gap-2">
                  <input value={checkinUrl} readOnly
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 select-all" />
                  <button onClick={handleCopy}
                    className="px-3 py-2 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 transition flex items-center gap-1">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
              </div>

              <div className="bg-brand-50 rounded-lg p-3 flex items-center gap-3">
                <Users className="w-5 h-5 text-brand-600" />
                <div>
                  <div className="text-sm font-semibold text-brand-700">
                    {checkedInCount} / {approvedEnrollments.length} 人已签到
                  </div>
                  <div className="text-xs text-brand-500">自动刷新中 (每5秒)</div>
                </div>
                <button onClick={() => refetch()} className="ml-auto p-1.5 text-brand-500 hover:bg-brand-100 rounded">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Attendance List */}
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">签到名单</h4>
            <div className="space-y-2">
              {approvedEnrollments.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">暂无已批准的成员</div>
              ) : (
                approvedEnrollments.map((enrollment) => {
                  const status = getStatus(enrollment.id);
                  return (
                    <div key={enrollment.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${status ? 'bg-green-500' : 'bg-slate-300'}`} />
                        <span className="text-sm font-medium text-slate-900">{enrollment.user?.name || '未知'}</span>
                        <span className="text-xs text-slate-400">{enrollment.user?.email}</span>
                      </div>
                      <div className="flex gap-1">
                        {(['present', 'late', 'excused', 'absent'] as const).map((s) => {
                          const config = attendanceLabels[s];
                          const isActive = status === s;
                          return (
                            <button
                              key={s}
                              onClick={() => setLocalStatus((prev) => ({ ...prev, [enrollment.id]: s }))}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                                isActive ? config.color : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              }`}
                            >
                              {config.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end px-6 py-4 border-t border-slate-200">
          <button onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            关闭
          </button>
          {Object.keys(localStatus).length > 0 && (
            <button onClick={handleSaveAttendance} disabled={recordAttendance.isPending}
              className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50">
              {recordAttendance.isPending ? '保存中...' : `保存更改 (${Object.keys(localStatus).length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

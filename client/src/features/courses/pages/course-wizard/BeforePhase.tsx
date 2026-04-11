import React, { useState, useRef } from 'react';
import { ChevronDown, ChevronUp, Search, QrCode, Download, Upload, X, Users, School, Globe } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Papa from 'papaparse';
import type { Course, Assessment, CoursePublishMode } from '@psynote/shared';
import type { CourseWizardState } from './CourseWizard';

const PUBLISH_MODE_OPTIONS: {
  value: CoursePublishMode;
  label: string;
  desc: string;
  Icon: React.FC<{ className?: string }>;
}[] = [
  { value: 'assign', label: '指定学员', desc: '选择具体来访者推送', Icon: Users },
  { value: 'class', label: '按班级/团体', desc: '批量导入名单', Icon: School },
  { value: 'public', label: '公开报名', desc: '生成报名链接，自助报名', Icon: Globe },
];

interface Props {
  state: CourseWizardState;
  onChange: (patch: Partial<CourseWizardState>) => void;
  courses: Course[];
  selectedCourse: Course | null;
  onCourseSelect: (courseId: string) => void;
  assessments: Assessment[];
  clients: Array<{ userId: string; name: string; email: string; role: string }>;
}

const sectionCls = 'bg-white rounded-xl border border-slate-200 overflow-hidden';
const headerCls = 'flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 transition';
const contentCls = 'px-5 pb-5 space-y-4';
const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const labelCls = 'block text-xs text-slate-500 mb-1';
const checkboxCls = 'rounded border-slate-300 text-brand-600 focus:ring-brand-500';

function CollapsibleSection({ title, subtitle, defaultOpen, children }: {
  title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className={sectionCls}>
      <button onClick={() => setOpen(!open)} className={headerCls}>
        <div>
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          {subtitle && <span className="text-xs text-slate-400 ml-2">{subtitle}</span>}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className={contentCls}>{children}</div>}
    </div>
  );
}

export function BeforePhase({ state, onChange, courses, selectedCourse, onCourseSelect, assessments, clients }: Props) {
  const [courseSearch, setCourseSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [csvPreview, setCsvPreview] = useState<Array<{ name: string; email?: string; phone?: string }>>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredCourses = courses.filter((c) =>
    !courseSearch || c.title.toLowerCase().includes(courseSearch.toLowerCase()),
  );
  const filteredClients = clients.filter((c) =>
    !memberSearch || c.name.toLowerCase().includes(memberSearch.toLowerCase()) || c.email.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  const handleCsvFile = (file: File) => {
    Papa.parse(file, {
      header: true, skipEmptyLines: true, encoding: 'UTF-8',
      complete: (results) => {
        const rows: Array<{ name: string; email?: string; phone?: string }> = [];
        const errors: string[] = [];
        results.data.forEach((row: any, idx: number) => {
          const name = row['姓名'] || row['name'] || '';
          const email = row['邮箱'] || row['email'] || '';
          const phone = row['手机号'] || row['phone'] || '';
          if (!name.trim()) { errors.push(`第 ${idx + 1} 行缺少姓名`); return; }
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(`第 ${idx + 1} 行邮箱格式无效`); return; }
          rows.push({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined });
        });
        setCsvPreview(rows); setCsvErrors(errors); onChange({ csvMembers: rows });
      },
    });
  };

  const downloadTemplate = () => {
    const csv = '\uFEFF姓名,邮箱,手机号\n张三,zhangsan@example.com,13800138000\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '课程学员导入模板.csv'; a.click();
  };

  const toggleMember = (userId: string) => {
    const ids = state.selectedMemberIds.includes(userId)
      ? state.selectedMemberIds.filter((id) => id !== userId)
      : [...state.selectedMemberIds, userId];
    onChange({ selectedMemberIds: ids });
  };

  const toggleAssessment = (list: string[] | undefined, id: string): string[] => {
    const arr = list || [];
    return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  };

  return (
    <div className="space-y-4">
      {/* Course Template Selection */}
      <CollapsibleSection title="课程模板" subtitle="必选" defaultOpen>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={courseSearch} onChange={(e) => setCourseSearch(e.target.value)}
            placeholder="搜索已发布课程..." className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {filteredCourses.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-400">
              {courses.length === 0 ? '暂无已发布课程，请先在课程工作室创建并发布' : '未找到匹配的课程'}
            </div>
          ) : filteredCourses.map((course) => (
            <button key={course.id} onClick={() => onCourseSelect(course.id)}
              className={`w-full text-left p-4 rounded-lg border transition ${
                state.courseId === course.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
              }`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-900">{course.title}</div>
                <span className="text-xs text-slate-400">{course.chapters?.length || 0} 章</span>
              </div>
              {course.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{course.description}</p>}
            </button>
          ))}
        </div>
        {selectedCourse && (
          <div className="bg-violet-50 rounded-lg p-4 space-y-2">
            <div className="text-xs font-medium text-violet-700">课程详情</div>
            {selectedCourse.targetAudience && <p className="text-xs text-violet-600">适用对象：{selectedCourse.targetAudience}</p>}
            {selectedCourse.duration && <p className="text-xs text-violet-600">时长：{selectedCourse.duration}</p>}
            {selectedCourse.chapters && selectedCourse.chapters.length > 0 && (
              <div className="text-xs text-violet-600">
                章节：
                <ol className="list-decimal list-inside mt-1 space-y-0.5">
                  {selectedCourse.chapters.map((ch, i) => <li key={i}>{ch.title}</li>)}
                </ol>
              </div>
            )}
          </div>
        )}
        {!state.courseId && <p className="text-xs text-amber-600">如需创建新课程，请先在知识库 → 课程工作室中创建并发布</p>}
      </CollapsibleSection>

      {/* Basic Info */}
      <CollapsibleSection title="基本信息" defaultOpen={!!state.courseId}>
        <div>
          <label className={labelCls}>课程标题 *</label>
          <input value={state.title} onChange={(e) => onChange({ title: e.target.value })}
            placeholder="如：2026春季情绪管理课程" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>课程描述</label>
          <textarea value={state.description} onChange={(e) => onChange({ description: e.target.value })}
            rows={3} placeholder="课程简介..." className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>授课形式</label>
          <div className="flex gap-2 mb-3">
            {(['offline', 'online'] as const).map((type) => (
              <button key={type} type="button" onClick={() => onChange({ locationType: type })}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  state.locationType === type ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {type === 'offline' ? '线下' : '线上'}
              </button>
            ))}
          </div>
          {state.locationType === 'offline' ? (
            <div>
              <label className={labelCls}>地址</label>
              <input value={state.location} onChange={(e) => onChange({ location: e.target.value })}
                placeholder="如：教学楼 301" className={inputCls} />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>会议平台</label>
                <select value={state.meetingPlatform} onChange={(e) => onChange({ meetingPlatform: e.target.value })} className={inputCls}>
                  <option value="">请选择</option>
                  <option value="腾讯会议">腾讯会议</option>
                  <option value="Zoom">Zoom</option>
                  <option value="钉钉">钉钉</option>
                  <option value="飞书">飞书</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>会议链接</label>
                <input value={state.meetingLink} onChange={(e) => onChange({ meetingLink: e.target.value })}
                  placeholder="粘贴会议链接或会议号" className={inputCls} />
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>容量</label>
            <input type="number" value={state.capacity || ''} onChange={(e) => onChange({ capacity: Number(e.target.value) || 0 })}
              min={0} placeholder="不填则不限" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>开始日期</label>
            <input type="date" value={state.startDate} onChange={(e) => onChange({ startDate: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>安排频率</label>
            <input value={state.schedule} onChange={(e) => onChange({ schedule: e.target.value })}
              placeholder="如：每周二 14:00-15:30" className={inputCls} />
          </div>
        </div>
      </CollapsibleSection>

      {/* Publish Mode */}
      <CollapsibleSection title="发布模式" defaultOpen={!!state.courseId}>
        <div>
          <label className={labelCls}>选择发布模式 *</label>
          <div className="grid grid-cols-3 gap-3 mt-1">
            {PUBLISH_MODE_OPTIONS.map(({ value, label, desc, Icon }) => (
              <button key={value} type="button" onClick={() => onChange({ publishMode: value })}
                className={`relative flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors ${
                  state.publishMode === value
                    ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}>
                <Icon className={`w-5 h-5 ${state.publishMode === value ? 'text-brand-600' : 'text-slate-400'}`} />
                <span className={`text-sm font-medium ${state.publishMode === value ? 'text-brand-700' : 'text-slate-700'}`}>{label}</span>
                <span className="text-[11px] text-slate-500 leading-tight">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Assign mode */}
        {state.publishMode === 'assign' && (
          <div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="搜索姓名或邮箱..." className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs" />
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {filteredClients.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center">暂无来访者</div>
              ) : filteredClients.map((c) => (
                <label key={c.userId} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={state.selectedMemberIds.includes(c.userId)}
                    onChange={() => toggleMember(c.userId)} className={checkboxCls} />
                  <span className="text-sm text-slate-900">{c.name}</span>
                  <span className="text-xs text-slate-400">{c.email}</span>
                </label>
              ))}
            </div>
            {state.selectedMemberIds.length > 0 && (
              <div className="mt-2 bg-brand-50 rounded-lg p-2.5 text-xs text-brand-700">已选 {state.selectedMemberIds.length} 人</div>
            )}
          </div>
        )}

        {/* Class mode */}
        {state.publishMode === 'class' && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>班级/团体名称</label>
              <input value={state.targetGroupLabel} onChange={(e) => onChange({ targetGroupLabel: e.target.value })}
                placeholder="如：高二3班" className={inputCls} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-700">导入学员名单</span>
                <button onClick={downloadTemplate} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
                  <Download className="w-3 h-3" /> 下载模板
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleCsvFile(file); }} />
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-200 rounded-lg py-4 text-sm text-slate-400 hover:border-brand-300 hover:text-brand-500 transition">
                点击选择 CSV 文件（姓名、邮箱、手机号）
              </button>
              {csvPreview.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-green-600">{csvPreview.length} 行有效</span>
                    <button onClick={() => { setCsvPreview([]); setCsvErrors([]); onChange({ csvMembers: [] }); }}
                      className="text-xs text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                  </div>
                  <div className="max-h-32 overflow-y-auto text-xs">
                    <table className="w-full">
                      <thead><tr className="text-slate-400"><th className="text-left py-1">姓名</th><th className="text-left py-1">邮箱</th><th className="text-left py-1">手机号</th></tr></thead>
                      <tbody>{csvPreview.slice(0, 10).map((row, i) => (
                        <tr key={i} className="text-slate-600"><td className="py-0.5">{row.name}</td><td className="py-0.5">{row.email || '-'}</td><td className="py-0.5">{row.phone || '-'}</td></tr>
                      ))}</tbody>
                    </table>
                    {csvPreview.length > 10 && <p className="text-slate-400 mt-1">...还有 {csvPreview.length - 10} 行</p>}
                  </div>
                </div>
              )}
              {csvErrors.length > 0 && <div className="mt-2 text-xs text-red-500 space-y-0.5">{csvErrors.map((err, i) => <div key={i}>{err}</div>)}</div>}
              {state.csvMembers.length > 0 && <div className="mt-2 bg-brand-50 rounded-lg p-2.5 text-xs text-brand-700">已导入 {state.csvMembers.length} 人</div>}
            </div>
          </div>
        )}

        {/* Public mode */}
        {state.publishMode === 'public' && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>报名人数上限</label>
              <input type="number" min={1} value={state.capacity || ''} onChange={(e) => onChange({ capacity: Number(e.target.value) || 0 })}
                placeholder="不填则不限制" className={inputCls} />
            </div>
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2"><QrCode className="w-4 h-4 text-slate-400" /><span className="text-sm text-slate-700">公开报名链接</span></div>
              <input value="发布后自动生成" readOnly className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-400" />
              <div className="flex justify-center py-3">
                <div className="bg-white p-3 rounded-xl shadow-sm"><QRCodeSVG value={`${window.location.origin}/course-enroll/preview`} size={120} level="M" /></div>
              </div>
              <p className="text-xs text-slate-400 text-center">发布后学员可通过此链接/二维码报名</p>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* Screening Assessment */}
      <CollapsibleSection title="入学量表" defaultOpen={false}>
        <p className="text-xs text-slate-400 mb-2">学员报名或入学时需完成的评估量表</p>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {assessments.length === 0 ? (
            <p className="text-xs text-slate-400 italic">暂无可用量表</p>
          ) : assessments.map((a: any) => (
            <label key={a.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={(state.assessmentConfig.screening || []).includes(a.id)}
                onChange={() => onChange({ assessmentConfig: { ...state.assessmentConfig, screening: toggleAssessment(state.assessmentConfig.screening, a.id) } })}
                className={checkboxCls} />
              {a.title}
            </label>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}

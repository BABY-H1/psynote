import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  CalendarDays,
  Layers,
  BookOpen,
  ClipboardList,
  FileSignature,
} from 'lucide-react';
import { useEpisodes, useAppointments } from '../../../api/useCounseling';
import { useGroupInstances } from '../../../api/useGroups';
import { useCourses } from '../../../api/useCourses';
import { useAssessments } from '../../../api/useAssessments';

/**
 * 看板 · 未来
 *
 * 6 瓦片数量看板，作为首页三段式中的"看板"段。每个瓦片展示一个待办或在办的负载维度，
 * 点击后跳转到交付中心对应类型筛选（Phase 3 落地）。
 *
 * 数据源：
 * - 活跃个案    → useEpisodes() 中 status='active'
 * - 本周预约    → useAppointments() 中 startTime 落在本周
 * - 进行中团辅  → useGroupInstances() 中 status ∈ {recruiting, ongoing, full}
 * - 进行中课程  → useCourses() 中 status='published'
 * - 待完成测评  → useAssessments() 中 status='active'
 * - 待签协议    → 占位 (Phase 7 才有 agreements API)
 *
 * 设计原则：
 * - 不接受 props，自包含数据获取，便于在任意位置挂载
 * - 单元格点击即跳转，强调"看板 → 操作"的扁平动线
 */
export function DashboardCountGrid() {
  const navigate = useNavigate();

  const { data: episodes } = useEpisodes();
  const { data: appointmentRows } = useAppointments();
  const { data: groups } = useGroupInstances();
  const { data: courses } = useCourses();
  const { data: assessments } = useAssessments();

  const activeEpisodes = episodes?.filter((e) => e.status === 'active') ?? [];

  // Appointments within current week (Mon-Sun in local time)
  const weekStart = startOfWeek(new Date());
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const appointmentsThisWeek = (appointmentRows ?? []).filter((r) => {
    const t = new Date(r.appointment.startTime).getTime();
    return t >= weekStart.getTime() && t < weekEnd.getTime();
  });

  const ongoingGroups =
    groups?.filter((g) => g.status === 'recruiting' || g.status === 'ongoing' || g.status === 'full') ?? [];

  const publishedCourses = courses?.filter((c) => c.status === 'published') ?? [];

  const activeAssessments = assessments?.filter((a) => a.status === 'active') ?? [];

  const tiles: TileData[] = [
    {
      label: '活跃个案',
      value: activeEpisodes.length,
      icon: <Activity className="w-4 h-4" />,
      tone: 'brand',
      onClick: () => navigate('/episodes'),
    },
    {
      label: '本周预约',
      value: appointmentsThisWeek.length,
      icon: <CalendarDays className="w-4 h-4" />,
      tone: 'blue',
      onClick: () => navigate('/availability'),
    },
    {
      label: '进行中团辅',
      value: ongoingGroups.length,
      icon: <Layers className="w-4 h-4" />,
      tone: 'amber',
      onClick: () => navigate('/groups'),
    },
    {
      label: '进行中课程',
      value: publishedCourses.length,
      icon: <BookOpen className="w-4 h-4" />,
      tone: 'purple',
      onClick: () => navigate('/courses'),
    },
    {
      label: '进行中测评',
      value: activeAssessments.length,
      icon: <ClipboardList className="w-4 h-4" />,
      tone: 'cyan',
      onClick: () => navigate('/assessments'),
    },
    {
      label: '待签协议',
      value: 0,
      icon: <FileSignature className="w-4 h-4" />,
      tone: 'slate',
      disabled: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {tiles.map((t) => (
        <CountTile key={t.label} {...t} />
      ))}
    </div>
  );
}

// ─── Tile component ──────────────────────────────────────────────

type Tone = 'brand' | 'blue' | 'amber' | 'purple' | 'cyan' | 'slate';

interface TileData {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: Tone;
  onClick?: () => void;
  disabled?: boolean;
}

const TONE_MAP: Record<Tone, { bg: string; text: string; iconBg: string }> = {
  brand: { bg: 'hover:bg-brand-50', text: 'text-brand-600', iconBg: 'bg-brand-50' },
  blue: { bg: 'hover:bg-blue-50', text: 'text-blue-600', iconBg: 'bg-blue-50' },
  amber: { bg: 'hover:bg-amber-50', text: 'text-amber-600', iconBg: 'bg-amber-50' },
  purple: { bg: 'hover:bg-purple-50', text: 'text-purple-600', iconBg: 'bg-purple-50' },
  cyan: { bg: 'hover:bg-cyan-50', text: 'text-cyan-600', iconBg: 'bg-cyan-50' },
  slate: { bg: '', text: 'text-slate-400', iconBg: 'bg-slate-100' },
};

function CountTile({ label, value, icon, tone, onClick, disabled }: TileData) {
  const t = TONE_MAP[tone];
  const cls = `bg-white rounded-xl border border-slate-200 p-4 text-left transition ${
    disabled ? 'cursor-default opacity-60' : `cursor-pointer ${t.bg}`
  }`;

  const content = (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">{label}</span>
        <div className={`${t.iconBg} ${t.text} p-1.5 rounded-md`}>{icon}</div>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
    </>
  );

  if (disabled || !onClick) {
    return <div className={cls}>{content}</div>;
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  // Returns Monday 00:00:00 of the week containing `d` (local time)
  const day = d.getDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1 - day); // Move back to Monday
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return result;
}

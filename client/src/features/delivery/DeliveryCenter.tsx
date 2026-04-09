import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, Layers, BookOpen, ClipboardList, FolderArchive, LayoutGrid } from 'lucide-react';
import { CaseWorkbench } from '../counseling/pages/CaseWorkbench';
import { GroupCenter } from '../groups/pages/GroupCenter';
import { CourseManagement } from '../courses/pages/CourseManagement';
import { AssessmentManagement } from '../assessment/pages/AssessmentManagement';
import { PeopleList } from './pages/PeopleList';
import {
  CardGrid,
  DeliveryCard,
  EmptyCard,
  PageLoading,
  type DeliveryCardData,
} from '../../shared/components';
import { useDeliveryServices } from '../../api/useDeliveryServices';
import type { ServiceInstance } from '@psynote/shared';

/**
 * 交付中心 — 单一入口，类型筛选，挂载现有列表页。
 *
 * Phase 3 的目标是把侧边栏从"4 个独立模块入口"收拢为"1 个交付中心 + 类型 tab"。
 * 这是路由层面的重构，**不改动任何现有列表页内容**：当用户切到 type=group 时，
 * DeliveryCenter 直接挂载未改动的 `<GroupCenter />`。
 *
 * Phase 4 之后，4 个列表页会逐个重写为基于 Phase 2 共享组件的实现，但
 * 每次重写都对 DeliveryCenter 透明 —— 它只负责"哪个 type 显示哪个组件"。
 *
 * URL 状态：
 *   /delivery               → type='all'   全部（v1 默认显示个案）
 *   /delivery?type=counseling → 个案
 *   /delivery?type=group      → 团辅
 *   /delivery?type=course     → 课程
 *   /delivery?type=assessment → 测评
 *   /delivery?type=archive    → 对象档案（Phase 6 落地，当前为占位）
 *
 * 切换 tab 通过 useSearchParams 更新 querystring，使得：
 *   - 浏览器后退/前进可用
 *   - 老书签仍可工作（4 个旧列表路径在 App.tsx 里重定向到此）
 */

type DeliveryType = 'all' | 'counseling' | 'group' | 'course' | 'assessment' | 'archive';

interface TypeTab {
  value: DeliveryType;
  label: string;
  icon: React.ReactNode;
  /** 可选副标题，主要用于"对象档案"占位 */
  badge?: string;
  disabled?: boolean;
}

const TYPE_TABS: TypeTab[] = [
  { value: 'all', label: '全部', icon: <LayoutGrid className="w-4 h-4" /> },
  { value: 'counseling', label: '个案', icon: <Activity className="w-4 h-4" /> },
  { value: 'group', label: '团辅', icon: <Layers className="w-4 h-4" /> },
  { value: 'course', label: '课程', icon: <BookOpen className="w-4 h-4" /> },
  { value: 'assessment', label: '测评', icon: <ClipboardList className="w-4 h-4" /> },
  { value: 'archive', label: '对象档案', icon: <FolderArchive className="w-4 h-4" /> },
];

const VALID_TYPES = TYPE_TABS.map((t) => t.value);

export function DeliveryCenter() {
  const [searchParams, setSearchParams] = useSearchParams();

  const type = useMemo<DeliveryType>(() => {
    const t = searchParams.get('type');
    if (t && VALID_TYPES.includes(t as DeliveryType)) return t as DeliveryType;
    return 'all';
  }, [searchParams]);

  const setType = (next: DeliveryType) => {
    if (next === 'all') {
      // Default tab — drop the param so URL stays clean
      const sp = new URLSearchParams(searchParams);
      sp.delete('type');
      setSearchParams(sp, { replace: false });
    } else {
      const sp = new URLSearchParams(searchParams);
      sp.set('type', next);
      setSearchParams(sp, { replace: false });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">交付中心</h1>
        <p className="text-sm text-slate-500 mt-1">
          所有交付服务的统一入口。按类型筛选，进入对应的工作区。
        </p>
      </div>

      {/* Type filter tabs */}
      <div className="flex flex-wrap items-center gap-1 bg-slate-100 rounded-xl p-1">
        {TYPE_TABS.map((t) => {
          const active = type === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => !t.disabled && setType(t.value)}
              disabled={t.disabled}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                active
                  ? 'bg-white text-slate-900 shadow-sm'
                  : t.disabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.icon}
              {t.label}
              {t.badge && (
                <span className="ml-1 text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-full">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body — mount current list page based on type */}
      <div>
        {type === 'all' && <AllAggregateView />}
        {type === 'counseling' && <CaseWorkbench />}
        {type === 'group' && <GroupCenter />}
        {type === 'course' && <CourseManagement />}
        {type === 'assessment' && <AssessmentManagement />}
        {type === 'archive' && <PeopleList />}
      </div>
    </div>
  );
}

/**
 * "全部" tab 的真实跨模块聚合视图(Phase 5a)。
 *
 * 通过 `useDeliveryServices()` 并行查询 4 个底层列表,经过 Phase 5 mapper
 * 折叠成 `ServiceInstance[]`,按 `lastActivityAt desc` 排序后用 DeliveryCard 渲染。
 *
 * 点击卡片根据 `kind` 跳到对应模块入口:
 *  - counseling → /episodes/:id (existing detail route)
 *  - group/course/assessment → /delivery?type=<kind> (since their detail UIs
 *    live inside the parent list page's view-state machine)
 *
 * Phase 5b 会把这部分换成 server-side UNION ALL 查询,届时只需把 hook 内部
 * 的 fan-out 实现替换掉,本组件接口不变。
 */
function AllAggregateView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Phase 5b — allow QA / dev to flip the aggregation source via querystring,
  // e.g. /delivery?source=server. Without the param, the hook falls back to
  // VITE_DELIVERY_AGGREGATION_SOURCE or 'client' (Phase 5a behaviour).
  const sourceParam = searchParams.get('source');
  const source = sourceParam === 'server' ? 'server' : sourceParam === 'client' ? 'client' : undefined;
  const { data, isLoading, source: actualSource } = useDeliveryServices({ limit: 60, source });

  if (isLoading) return <PageLoading text="加载所有服务..." />;

  if (data.length === 0) {
    return (
      <EmptyCard
        title="暂无任何服务"
        description="尚未创建任何个案、团辅、课程或测评。从下方类型 tab 进入对应工作区开始创建。"
      />
    );
  }

  const totalText = `共 ${data.length} 项服务，按最近活动排序`;
  const sourceLabel = actualSource === 'server' ? '聚合源: server (5b)' : '聚合源: client (5a)';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-slate-500">{totalText}</p>
        <span className="text-[10px] text-slate-400 font-mono">{sourceLabel}</span>
      </div>
      <CardGrid cols={2}>
        {data.map((svc) => {
          const { statusText, statusClassName } = getStatusOverride(svc);
          return (
            <DeliveryCard
              key={`${svc.kind}-${svc.id}`}
              data={serviceInstanceToCardData(svc)}
              onOpen={() => openServiceInstance(svc, navigate)}
              statusText={statusText}
              statusClassName={statusClassName}
            />
          );
        })}
      </CardGrid>
    </div>
  );
}

/**
 * Per-kind status text/className overrides so the All view matches the labels
 * shown in each module's own list page (Phase 4a-4d). Without this, "closed"
 * counseling episodes would show "已结束" here but "已结案" in CaseWorkbench.
 */
function getStatusOverride(svc: ServiceInstance): { statusText?: string; statusClassName?: string } {
  if (svc.kind === 'counseling') {
    if (svc.status === 'closed') {
      return { statusText: '已结案', statusClassName: 'bg-slate-100 text-slate-500' };
    }
    if (svc.status === 'paused') {
      return { statusText: '暂停', statusClassName: 'bg-yellow-50 text-yellow-700' };
    }
  }
  if (svc.kind === 'group') {
    if (svc.status === 'completed') {
      return { statusText: '已结束', statusClassName: 'bg-slate-100 text-slate-500' };
    }
  }
  if (svc.kind === 'course') {
    if (svc.status === 'closed') {
      return { statusText: '已关闭', statusClassName: 'bg-amber-100 text-amber-700' };
    }
  }
  if (svc.kind === 'assessment') {
    // ServiceStatus 'ongoing' for active assessments → green per-module palette
    if (svc.status === 'ongoing') {
      return { statusText: '进行中', statusClassName: 'bg-green-100 text-green-700' };
    }
    if (svc.status === 'paused') {
      return { statusText: '已停用', statusClassName: 'bg-slate-100 text-slate-500' };
    }
    if (svc.status === 'draft') {
      return { statusText: '草稿', statusClassName: 'bg-yellow-100 text-yellow-700' };
    }
  }
  return {};
}

/**
 * Convert a `ServiceInstance` (Phase 0 type) into a `DeliveryCardData` shape
 * (Phase 2 UI type), filling in description and meta from kind-specific fields.
 *
 * The mapper layer is intentionally tiny: most of the work was already done by
 * the per-kind mapper functions in `service-instance-mappers.ts`. This wrapper
 * is only responsible for computing the display-only `description` and `meta`,
 * which are NOT part of `ServiceInstance` itself.
 */
function serviceInstanceToCardData(svc: ServiceInstance): DeliveryCardData {
  const meta: DeliveryCardData['meta'] = [];
  // Per-kind meta enrichment
  if (svc.kind === 'counseling') {
    meta.push({ label: '风险', value: svc.currentRisk });
    if (svc.nextSessionAt) meta.push({ label: '下次', value: formatDate(svc.nextSessionAt) });
  } else if (svc.kind === 'group') {
    if (svc.capacity) meta.push({ label: '容量', value: svc.capacity });
  } else if (svc.kind === 'course') {
    if (svc.courseType) meta.push(svc.courseType);
    meta.push({ label: '已加入', value: `${svc.participantCount} 人` });
  } else if (svc.kind === 'assessment') {
    if (svc.assessmentType) meta.push(svc.assessmentType);
  }
  meta.push({ label: '更新', value: formatRelative(svc.lastActivityAt || svc.updatedAt) });

  return {
    id: svc.id,
    kind: svc.kind,
    title: svc.title,
    status: svc.status,
    meta,
  };
}

/**
 * Resolve where to navigate when a card is clicked. Counseling has a real
 * deep-link `/episodes/:id`; the other three modules render details inside the
 * parent list page's local view-state, so we send the user to the type tab.
 */
function openServiceInstance(
  svc: ServiceInstance,
  navigate: (to: string) => void,
) {
  if (svc.kind === 'counseling') {
    navigate(`/episodes/${svc.id}`);
    return;
  }
  navigate(`/delivery?type=${svc.kind}`);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 月前`;
  return `${Math.floor(days / 365)} 年前`;
}

// `ArchivePlaceholder` was removed in Phase 6 once the real `PeopleList`
// component shipped. The "对象档案" tab now mounts <PeopleList /> directly.

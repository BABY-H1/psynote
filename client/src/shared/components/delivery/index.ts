/**
 * 共享交付组件入口（Phase 2 完成）。
 *
 * 本目录承载所有跨交付模块共用的 UI 组件。8 个组件分两个 PR 落地：
 *
 * PR#4 (基础组件)：
 *   - CardGrid           grid 间距 wrapper
 *   - EmptyCard          卡片式空状态
 *   - StatusFilterTabs   状态筛选 tab 行（带计数气泡）
 *   - DeliveryCard       跨模块统一的服务卡片
 *
 * PR#5 (复合组件)：
 *   - ServiceTabBar       5 个标准 tab（总览/参与者/时间线/记录/资产）
 *   - ServiceDetailLayout 详情页外壳（双 variant: tabs / workspace）
 *   - AIChatPanel         右侧 AI 对话面板
 *   - CreateServiceWizard 创建向导外壳（步骤进度点）
 *
 * 用法见每个组件文件顶部的 JSDoc。验收页面位于 `/dev/delivery-components`。
 */

export { CardGrid } from './CardGrid';
export type { CardGridCols } from './CardGrid';

export { EmptyCard } from './EmptyCard';

export { StatusFilterTabs } from './StatusFilterTabs';
export type { StatusFilterOption } from './StatusFilterTabs';

export { DeliveryCard } from './DeliveryCard';
export type { DeliveryCardData } from './DeliveryCard';

export { ServiceTabBar } from './ServiceTabBar';
export type { ServiceTab } from './ServiceTabBar';

export { ServiceDetailLayout } from './ServiceDetailLayout';

export { AIChatPanel } from './AIChatPanel';
export type { AIChatMessage, AIChatRole } from './AIChatPanel';

export { CreateServiceWizard } from './CreateServiceWizard';
export type { WizardStep } from './CreateServiceWizard';

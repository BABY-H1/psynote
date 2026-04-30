export { Spinner, PageLoading } from './Spinner';
export { EmptyState } from './EmptyState';
export { StatusBadge, RiskBadge } from './StatusBadge';
export { PageHeader } from './PageHeader';
export { ToastProvider, useToast } from './Toast';
export { ErrorBoundary } from './ErrorBoundary';

// Phase 2 — 共享交付组件
export * from './delivery';

// Phase 7a — Feature flag gate
export { FeatureGate } from './FeatureGate';

// AI provenance / 合规水印 — surfaces "AI 生成 / 已审核" on AI-authored payloads
export { AIBadge } from './AIBadge';
export type { AIBadgeProps } from './AIBadge';

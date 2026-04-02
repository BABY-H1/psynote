import React from 'react';

type Variant = 'green' | 'yellow' | 'red' | 'blue' | 'orange' | 'slate' | 'purple';

const VARIANT_CLASSES: Record<Variant, string> = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-700',
  orange: 'bg-amber-100 text-amber-700',
  slate: 'bg-slate-100 text-slate-500',
  purple: 'bg-purple-100 text-purple-700',
};

// Risk level mapping (4-tier triage)
const RISK_VARIANTS: Record<string, Variant> = {
  level_1: 'green',
  level_2: 'yellow',
  level_3: 'orange',
  level_4: 'red',
};

const RISK_LABELS: Record<string, string> = {
  level_1: '一般',
  level_2: '关注',
  level_3: '严重',
  level_4: '危机',
};

interface StatusBadgeProps {
  label: string;
  variant?: Variant;
  className?: string;
}

export function StatusBadge({ label, variant = 'slate', className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {label}
    </span>
  );
}

export function RiskBadge({ level, className = '' }: { level: string; className?: string }) {
  const variant = RISK_VARIANTS[level] || 'slate';
  const label = RISK_LABELS[level] || level;
  return <StatusBadge label={label} variant={variant} className={className} />;
}

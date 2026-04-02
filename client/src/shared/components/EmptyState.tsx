import React from 'react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      {title && <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>}
      {description && <p className="text-xs text-slate-400 mb-4">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

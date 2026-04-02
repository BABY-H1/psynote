import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  backTo?: { label: string; onClick: () => void };
}

export function PageHeader({ title, description, actions, backTo }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {backTo && (
        <button
          onClick={backTo.onClick}
          className="text-sm text-slate-500 hover:text-slate-700 mb-3 inline-flex items-center gap-1"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {backTo.label}
        </button>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}

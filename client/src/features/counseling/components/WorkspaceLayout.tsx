import React, { useState, useCallback, useRef, useEffect } from 'react';

interface Props {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  defaultLeftWidth?: number;
  defaultRightWidth?: number;
  minWidth?: number;
}

export function WorkspaceLayout({
  left, center, right,
  defaultLeftWidth = 280,
  defaultRightWidth = 260,
  minWidth = 180,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [rightWidth, setRightWidth] = useState(defaultRightWidth);
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null);

  const handleMouseDown = useCallback((side: 'left' | 'right') => {
    setDragging(side);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (dragging === 'left') {
        const newWidth = Math.max(minWidth, Math.min(e.clientX - rect.left, rect.width * 0.4));
        setLeftWidth(newWidth);
      } else {
        const newWidth = Math.max(minWidth, Math.min(rect.right - e.clientX, rect.width * 0.4));
        setRightWidth(newWidth);
      }
    };

    const handleMouseUp = () => setDragging(null);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, minWidth]);

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-5rem)] select-none">
      {/* Left panel */}
      <div
        className="flex-shrink-0 overflow-y-auto border-r border-slate-200 bg-white"
        style={{ width: leftWidth }}
      >
        {left}
      </div>

      {/* Left resize handle */}
      <div
        className={`w-1 flex-shrink-0 cursor-col-resize hover:bg-brand-300 transition-colors ${dragging === 'left' ? 'bg-brand-400' : 'bg-transparent'}`}
        onMouseDown={() => handleMouseDown('left')}
      />

      {/* Center panel */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-slate-50">
        {center}
      </div>

      {/* Right resize handle */}
      <div
        className={`w-1 flex-shrink-0 cursor-col-resize hover:bg-brand-300 transition-colors ${dragging === 'right' ? 'bg-brand-400' : 'bg-transparent'}`}
        onMouseDown={() => handleMouseDown('right')}
      />

      {/* Right panel */}
      <div
        className="flex-shrink-0 overflow-y-auto border-l border-slate-200 bg-white"
        style={{ width: rightWidth }}
      >
        {right}
      </div>
    </div>
  );
}

/** Collapsible section within center panel */
export function CollapsibleSection({
  title, icon, defaultOpen = true, children,
}: {
  title: string; icon?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {icon}
          {title}
        </span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

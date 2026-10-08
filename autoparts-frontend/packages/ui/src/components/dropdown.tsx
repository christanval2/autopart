import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@autoparts/utils';

export function Dropdown({
  trigger,
  children,
  align = 'right',
}: {
  trigger: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1">
        {trigger}
        <ChevronDown strokeWidth={1.5} className="h-4 w-4 opacity-60" />
      </button>
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-2 min-w-44 rounded-card border border-border bg-card py-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          onClick={() => setOpen(false)}
        >
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  onClick,
  children,
  danger,
}: {
  onClick?: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'block w-full px-4 py-2 text-left text-sm hover:bg-muted',
        danger ? 'text-destructive' : 'text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </span>
  );
}

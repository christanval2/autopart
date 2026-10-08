import type { HTMLAttributes } from 'react';
import { cn } from '@autoparts/utils';

/**
 * Badge — variants shadcn/ui (default, secondary, destructive, outline)
 * + success / accent portés par les tokens. Alias legacy acceptés :
 * primary→default, neutral→secondary, info→default, danger→destructive.
 */
export type BadgeTone =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'accent'
  | 'primary'
  | 'neutral'
  | 'info'
  | 'danger';

const tones: Record<BadgeTone, string> = {
  default: 'bg-primary/10 text-primary',
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary text-secondary-foreground',
  neutral: 'bg-secondary text-secondary-foreground',
  destructive: 'bg-destructive/10 text-destructive',
  danger: 'bg-destructive/10 text-destructive',
  outline: 'border border-border text-foreground',
  success: 'bg-success/10 text-success',
  info: 'bg-primary/10 text-primary',
  accent: 'bg-accent/10 text-accent',
};

export function Badge({
  tone = 'secondary',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Avatar({
  name,
  src,
  size = 'md',
}: {
  name?: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' }[size];
  if (src) {
    return <img src={src} alt={name ?? 'Avatar'} className={cn('rounded-full object-cover', dims)} />;
  }
  const initials = (name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground',
        dims,
      )}
    >
      {initials}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary',
        className,
      )}
      role="status"
      aria-label="Chargement"
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

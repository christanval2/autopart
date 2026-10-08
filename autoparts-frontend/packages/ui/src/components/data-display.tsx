import { Component, type ErrorInfo, type ReactNode } from 'react';
import { PackageOpen, AlertTriangle } from 'lucide-react';
import { cn, formatPrice } from '@autoparts/utils';
import type { OrderStatus, PaymentStatus, ShipmentStatus } from '@autoparts/types';

// ── EmptyState (shadcn-style) ─────────────────────────────────
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <PackageOpen className="h-6 w-6" strokeWidth={1.5} />}
      </div>
      <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  );
}

// ── ErrorBoundary ─────────────────────────────────────────────
interface EBState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" strokeWidth={1.5} />
          <h2 className="text-lg font-semibold text-foreground">Une erreur est survenue</h2>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}


// ── PriceTag ───────────────────────────────────────────────────
export function PriceTag({
  amount,
  original,
  size = 'md',
  className,
}: {
  amount: number | string | null | undefined;
  original?: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'text-sm font-semibold',
    md: 'text-lg font-bold',
    lg: 'text-2xl font-bold',
  };
  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <span className={cn('text-primary', sizes[size])}>{formatPrice(amount)}</span>
      {original != null && Number(original) > Number(amount ?? 0) && (
        <span className="text-xs text-muted-foreground line-through">{formatPrice(original)}</span>
      )}
    </span>
  );
}

// ── StatusBadge (commandes / paiements / livraisons) ──────────
// Rôles token : succès (payé/livré), accent corail (en attente/traitement),
// destructive (annulé/échec), primary/secondary (transitions). Jamais de jaune.
const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  confirmed: 'Confirmée',
  processing: 'En traitement',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
  pending: 'En attente',
  completed: 'Payé',
  failed: 'Échoué',
  preparing: 'En préparation',
  in_transit: 'En transit',
  out_for_delivery: 'En livraison',
  returned: 'Retourné',
};

type StatusTone = 'default' | 'success' | 'destructive' | 'accent' | 'secondary';

const STATUS_TONES: Record<string, StatusTone> = {
  draft: 'secondary',
  confirmed: 'default',
  processing: 'accent',
  shipped: 'default',
  delivered: 'success',
  cancelled: 'destructive',
  refunded: 'secondary',
  pending: 'accent',
  completed: 'success',
  failed: 'destructive',
  preparing: 'accent',
  in_transit: 'default',
  out_for_delivery: 'default',
  returned: 'secondary',
};

const toneClasses: Record<StatusTone, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  destructive: 'bg-destructive/10 text-destructive',
  accent: 'bg-accent/10 text-accent',
  secondary: 'bg-secondary text-secondary-foreground',
};

export function StatusBadge({
  status,
  className,
}: {
  status: OrderStatus | PaymentStatus | ShipmentStatus | string;
  className?: string;
}) {
  const tone = STATUS_TONES[status] ?? 'secondary';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── RatingStars ───────────────────────────────────────────────
export function RatingStars({
  value,
  size = 16,
  onChange,
  showValue,
}: {
  value: number;
  size?: number;
  onChange?: (v: number) => void;
  showValue?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          className={cn(
            i <= Math.round(value) ? 'fill-accent stroke-accent' : 'fill-muted stroke-muted-foreground/30',
            onChange && 'cursor-pointer transition-colors',
          )}
          onClick={() => onChange?.(i)}
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
      {showValue && <span className="ml-1 text-xs text-muted-foreground">{value.toFixed(1)}/5</span>}
    </span>
  );
}

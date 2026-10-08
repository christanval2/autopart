// ── Mes commandes client — cartes modernes + filtres pills ─────
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Package } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@autoparts/ui';
import { ordersApi } from '@autoparts/api';
import { formatDate, formatPrice } from '@autoparts/utils';
import { StatusBadge } from '@autoparts/ui';
import type { Order, OrderStatus } from '@autoparts/types';

const STATUS_FILTERS: Array<{ value: OrderStatus | ''; label: string }> = [
  { value: '', label: 'Toutes' },
  { value: 'processing', label: 'En cours' },
  { value: 'shipped', label: 'Expédiées' },
  { value: 'delivered', label: 'Livrées' },
  { value: 'cancelled', label: 'Annulées' },
];

const COUNT_AS = (s: OrderStatus): OrderStatus | '' =>
  s === 'processing' ? 'processing' : s;

export default function MesCommandesPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<OrderStatus | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['orders', 'mine', page, filter],
    queryFn: () =>
      ordersApi.list({
        page,
        limit: 8,
        status: filter
          ? filter === 'processing'
            ? 'processing'
            : filter
          : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold">Mes commandes</h1>
        <p className="text-sm text-muted-foreground">Suivez vos achats et leurs livraisons.</p>
      </header>

      {/* Filtres pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => { setFilter(f.value); setPage(1); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : (data?.items.length ?? 0) === 0 ? (
        <div className="py-8">
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title="Aucune commande"
            description="Vos commandes apparaîtront ici dès votre premier achat."
            action={<Link to="/catalogue"><Button>Voir le catalogue</Button></Link>}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {(data?.items ?? []).map((o) => (
              <Link
                key={o.id}
                to={`/commandes/${o.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Package className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">{o.orderNumber}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {o.lines?.length ?? 0} article{(o.lines?.length ?? 0) > 1 ? 's' : ''} · {formatDate(o.orderedAt ?? o.createdAt)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display font-bold text-foreground">{formatPrice(o.totalAmount)}</div>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {(data?.pagination?.total ?? 0) > 8 && (
            <div className="mt-5 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Précédent
              </Button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(page + 1)}>Suivant</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

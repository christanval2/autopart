// ── Dashboard vendeur (anlt-1) : CA, commandes, top produits ──
import { useQuery } from '@tanstack/react-query';
import { CreditCard, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import { ordersApi, analyticsApi } from '@autoparts/api';
import { formatPrice } from '@autoparts/utils';
import { AnyChart, KpiCard } from '@/components/charts/AnyChart';

export default function DashboardVendeurPage() {
  const { data: stats } = useQuery({
    queryKey: ['orders', 'stats'],
    queryFn: ordersApi.stats,
  });

  const { data: timeline } = useQuery({
    queryKey: ['analytics', 'timeline', 'month'],
    queryFn: () => analyticsApi.timeline('month'),
  });

  const { data: top } = useQuery({
    queryKey: ['analytics', 'top', 10],
    queryFn: () => analyticsApi.topProducts(10),
  });

  const { data: conversion } = useQuery({
    queryKey: ['analytics', 'conversion'],
    queryFn: analyticsApi.conversion,
  });

  const timelineData = (timeline ?? []).map((p) => ({ period: new Date(p.period).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), revenue: Number(p.revenue), orders: p.orders ?? 0 }));
  const topData = (top ?? []).slice(0, 8).map((p) => ({
    period: (p.name ?? p.productId).slice(0, 22),
    ventes: Number(p.totalQty ?? 0),
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Tableau de bord vendeur</h1>
        <p className="text-sm text-muted-foreground">Performances de vente, CA et encours.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="CA total"
          value={formatPrice(Number(stats?.totals?.revenue ?? 0))}
          icon={<CreditCard strokeWidth={1.5} className="h-4 w-4" />}
        />
        <KpiCard label="Commandes" value={Number(stats?.totals?.count ?? 0)} icon={<ShoppingCart strokeWidth={1.5} className="h-4 w-4" />} />
        <KpiCard
          label="En traitement"
          value={(stats?.byStatus ?? []).reduce((s, b) => s + (b.status === 'processing' || b.status === 'confirmed' ? Number(b.count) : 0), 0)}
          hint="À préparer / expédier"
        />
        <KpiCard
          label="Taux de conversion"
          value={`${((Number(conversion?.orders?.totalOrders ?? 0) / Math.max(1, Number(conversion?.searches?.totalSearches ?? 1))) * 100).toFixed(1)}%`}
          icon={<TrendingUp strokeWidth={1.5} className="h-4 w-4" />}
          hint="Vues → commandes"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Évolution du CA</h2>
          <AnyChart
            type="line"
            data={timelineData}
            xKey="period"
            yKeys={['revenue']}
            seriesNames={['CA (XAF)']}
            height={280}
          />
        </div>
        <div className="rounded-card border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Top 10 produits vendus</h2>
          <AnyChart type="bar" data={topData} xKey="period" yKeys={['ventes']} seriesNames={['Quantité']} height={280} />
        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Wallet strokeWidth={1.5} className="h-3 w-3" />
        Encours clients et rapports B2B détaillés : disponibles après le module V2 Analytics.
      </p>
    </div>
  );
}

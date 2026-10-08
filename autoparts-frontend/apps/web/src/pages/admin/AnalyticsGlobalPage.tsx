// ── Analytics global (admin) : plateforme complète ─────────────
import { useQuery } from '@tanstack/react-query';
import { ordersApi, analyticsApi } from '@autoparts/api';
import { formatPrice } from '@autoparts/utils';
import { Card, CardContent } from '@autoparts/ui';
import { AnyChart, KpiCard } from '@/components/charts/AnyChart';

export default function AnalyticsGlobalPage() {
  const { data: timelineDay } = useQuery({
    queryKey: ['analytics', 'timeline', 'day'],
    queryFn: () => analyticsApi.timeline('day'),
  });
  const { data: byCategory } = useQuery({
    queryKey: ['analytics', 'categories'],
    queryFn: () => analyticsApi.revenueByCategory(),
  });
  const { data: top } = useQuery({
    queryKey: ['analytics', 'top', 10],
    queryFn: () => analyticsApi.topProducts(10),
  });
  const { data: slow } = useQuery({
    queryKey: ['analytics', 'slow', 10],
    queryFn: () => analyticsApi.slowMovers(10),
  });
  const { data: conversion } = useQuery({
    queryKey: ['analytics', 'conversion'],
    queryFn: analyticsApi.conversion,
  });
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Analytics global</h1>
        <p className="text-sm text-muted-foreground">Reporting plateforme — ventes, catégories, conversion.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="GMV"
          value={formatPrice((timelineDay ?? []).reduce((s, p) => s + Number(p.revenue), 0))}
        />
        <KpiCard
          label="Commandes"
          value={(timelineDay ?? []).reduce((s, p) => s + Number(p.orders ?? 0), 0)}
        />
        <KpiCard label="Vues" value={Number(conversion?.searches?.totalSearches ?? 0)} />
        <KpiCard label="Taux de conversion" value={`${((Number(conversion?.orders?.totalOrders ?? 0) / Math.max(1, Number(conversion?.searches?.totalSearches ?? 1))) * 100).toFixed(1)}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <h2 className="mb-2 text-sm font-semibold">CA quotidien (30 derniers points)</h2>
            <AnyChart
              type="area"
              data={(timelineDay ?? []).map((p) => ({ period: new Date(p.period).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), revenue: Number(p.revenue) }))}
              xKey="period"
              yKeys={['revenue']}
              seriesNames={['CA (XAF)']}
              height={280}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <h2 className="mb-2 text-sm font-semibold">CA par catégorie</h2>
            <AnyChart
              type="pie"
              data={(byCategory ?? []).map((c) => ({ x: c.categoryName ?? c.categoryId, value: Number(c.revenue) }))}
              height={280}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <h2 className="mb-2 text-sm font-semibold">Top produits plateforme</h2>
            <AnyChart
              type="bar"
              data={(top ?? []).slice(0, 8).map((p) => ({ period: (p.name ?? p.productId).slice(0, 22), ventes: Number(p.totalQty ?? 0) }))}
              xKey="period"
              yKeys={['ventes']}
              seriesNames={['Quantité']}
              height={300}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <h2 className="mb-2 text-sm font-semibold">Produits dormants</h2>
            <AnyChart
              type="bar"
              data={(slow ?? []).slice(0, 8).map((p) => ({ period: (p.name ?? p.productId).slice(0, 22), ventes: Number(p.totalQty ?? 0) }))}
              xKey="period"
              yKeys={['ventes']}
              seriesNames={['Ventes 90 j']}
              height={300}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

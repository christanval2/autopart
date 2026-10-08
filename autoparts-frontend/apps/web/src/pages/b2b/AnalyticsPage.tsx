// ── Analytics avancé (vendeur) : top/slow movers, conversion,
//    prix négociés contractuels ─────────────────────────────────
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, priceContractsApi } from '@autoparts/api';
import { formatDate, formatPrice } from '@autoparts/utils';
import { Badge, Button, Card, CardContent, DataTable, type Column } from '@autoparts/ui';
import { AnyChart, KpiCard } from '@/components/charts/AnyChart';
import type { PriceContract } from '@autoparts/types';
import type { TopProduct } from '@autoparts/types';

export default function AnalyticsVendeurPage() {
  const { data: top } = useQuery({
    queryKey: ['analytics', 'top', 10],
    queryFn: () => analyticsApi.topProducts(10),
  });
  const { data: slow } = useQuery({
    queryKey: ['analytics', 'slow', 10],
    queryFn: () => analyticsApi.slowMovers(10),
  });
  const { data: timeline } = useQuery({
    queryKey: ['analytics', 'timeline', 'week'],
    queryFn: () => analyticsApi.timeline('week'),
  });
  const { data: conversion } = useQuery({
    queryKey: ['analytics', 'conversion'],
    queryFn: analyticsApi.conversion,
  });
  const { data: contracts = [] } = useQuery({
    queryKey: ['b2b', 'price-contracts'],
    queryFn: priceContractsApi.list,
  });

  const slowColumns: Column<TopProduct>[] = [
    { key: 'name', header: 'Produit', render: (p) => p.name ?? p.productId.slice(0, 8) },
    { key: 'totalQty', header: 'Ventes 90 j', render: (p) => Number(p.totalQty ?? 0) },
    { key: 'revenue', header: 'CA', render: (p) => formatPrice(Number(p.totalRevenue ?? 0)) },
  ];

  const contractColumns: Column<PriceContract>[] = [
    {
      key: 'variant',
      header: 'Variante',
      render: (c) => (
        <span className="font-mono text-xs">
          {c.variant?.variantSku ?? c.variantId?.slice(0, 8) ?? '—'}
        </span>
      ),
    },
    { key: 'contractPrice', header: 'Prix négocié', render: (c) => formatPrice(c.contractPrice) },
    { key: 'validUntil', header: 'Validité', render: (c) => formatDate(c.validUntil) },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Analytics avancé</h1>
        <p className="text-sm text-muted-foreground">Performance par produit, funnel de conversion, prix contractuels.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Recherches" value={Number(conversion?.searches?.totalSearches ?? 0)} hint="Requêtes utilisateurs" />
        <KpiCard label="Commandes" value={Number(conversion?.orders?.totalOrders ?? 0)} hint="Non annulées" />
        <KpiCard
          label="Conversion"
          value={`${((Number(conversion?.orders?.totalOrders ?? 0) / Math.max(1, Number(conversion?.searches?.totalSearches ?? 1))) * 100).toFixed(1)}%`}
          hint="Panier → commande"
        />
      </div>

      <div className="rounded-card border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">CA hebdomadaire</h2>
        <AnyChart
          type="line"
          data={(timeline ?? []).map((p) => ({ period: new Date(p.period).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), revenue: Number(p.revenue) }))}
          xKey="period"
          yKeys={['revenue']}
          seriesNames={['CA (XAF)']}
          height={260}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Top produits</h2>
          <DataTable
            columns={[
              { key: 'name', header: 'Produit', render: (p: TopProduct) => p.name ?? p.productId.slice(0, 8) },
              { key: 'totalQty', header: 'Vendus', render: (p: TopProduct) => Number(p.totalQty ?? 0) },
              { key: 'revenue', header: 'CA', render: (p: TopProduct) => formatPrice(Number(p.totalRevenue ?? 0)) },
            ]}
            rows={top ?? []}
            rowKey={(p) => p.productId}
            emptyLabel="Aucune vente"
          />
        </div>
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            Produits dormants (90 j) <Badge tone="accent">à actionner</Badge>
          </h2>
          <DataTable columns={slowColumns} rows={slow ?? []} rowKey={(p) => p.productId} emptyLabel="Aucun produit dormant" />
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Prix négociés contractuels</h2>
          </div>
          <DataTable columns={contractColumns} rows={contracts} rowKey={(c) => c.id} emptyLabel="Aucun contrat" />
          <p className="text-xs text-muted-foreground">
            Les contrats garantissent un prix fixe par client sur une période — créer via l'API
            (POST /price-contracts) depuis la fiche variante.
          </p>
          <Button size="sm" variant="outline" onClick={() => window.open('/b2b/produits', '_self')}>
            Aller à mes produits
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

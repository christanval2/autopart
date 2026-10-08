// ── Dashboard admin global — poste de contrôle de la plateforme ──
// Tous les chiffres proviennent d'endpoints réels (aucune donnée fictive).
import { useQuery } from '@tanstack/react-query';
import {
  Users, ShoppingCart, CreditCard, AlertTriangle, TrendingUp,
  Search, Star, Scale, Percent, Ban,
} from 'lucide-react';
import { ordersApi, analyticsApi, paymentsApi, disputesApi, promotionsApi, commissionsApi } from '@autoparts/api';
import { formatPrice } from '@autoparts/utils';
import { AnyChart, KpiCard } from '@/components/charts/AnyChart';

const fmtDay = (p: string) =>
  new Date(p).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
const fmtMonth = (p: string) =>
  new Date(p).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });

const METHOD_LABELS: Record<string, string> = {
  mobile_money_mtn: 'MTN MoMo',
  mobile_money_orange: 'Orange Money',
  bank_transfer: 'Virement',
  cash: 'Espèces',
  credit: 'Crédit',
  card: 'Carte',
};

const DISPUTE_LABELS: Record<string, string> = {
  open: 'Ouverts',
  under_review: 'En examen',
  resolved_buyer: 'Résolus (acheteur)',
  resolved_seller: 'Résolus (vendeur)',
  closed: 'Clos',
};

export default function DashboardAdminPage() {
  // ── Analytics ═══════════════════════════════════════════════
  const { data: timelineDay } = useQuery({
    queryKey: ['analytics', 'timeline', 'day'],
    queryFn: () => analyticsApi.timeline('day'),
  });
  const { data: timelineMonth } = useQuery({
    queryKey: ['analytics', 'timeline', 'month'],
    queryFn: () => analyticsApi.timeline('month'),
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

  // ── Opérationnel ════════════════════════════════════════════
  const { data: payments } = useQuery({
    queryKey: ['admin', 'payments', 'all'],
    queryFn: () => paymentsApi.list(1, 100),
  });
  const { data: disputes } = useQuery({
    queryKey: ['admin', 'disputes', 'all'],
    queryFn: () => disputesApi.list(1, 100),
  });
  const { data: promos } = useQuery({
    queryKey: ['admin', 'promotions'],
    queryFn: () => promotionsApi.list(false),
  });
  const { data: commissionsSummary } = useQuery({
    queryKey: ['admin', 'commissions', 'summary'],
    queryFn: () => commissionsApi.summary(),
  });

  // ── Agrégats ════════════════════════════════════════════════
  const gmv = (timelineMonth ?? []).reduce((s, p) => s + Number(p.revenue), 0);
  const ordersTotal = (timelineMonth ?? []).reduce((s, p) => s + Number(p.orders ?? 0), 0);
  const searches = Number(conversion?.searches?.totalSearches ?? 0);
  const conversionPct = (Number(conversion?.orders?.totalOrders ?? 0) / Math.max(1, searches)) * 100;
  const avgRating = Number(conversion?.reviews?.avgRating ?? 0);

  const dayData = (timelineDay ?? []).map((p) => ({ period: fmtDay(p.period), revenue: Number(p.revenue) }));
  const monthOrders = (timelineMonth ?? []).map((p) => ({ period: fmtMonth(p.period), commandes: Number(p.orders ?? 0) }));
  const categoryData = (byCategory ?? []).map((c) => ({
    x: c.categoryName ?? c.categoryId,
    name: c.categoryName ?? c.categoryId,
    value: Number(c.revenue),
  }));
  const topData = (top ?? []).slice(0, 8).map((p) => ({ period: (p.name ?? p.productId).slice(0, 22), ventes: Number(p.totalQty ?? 0) }));
  const slowData = (slow ?? []).slice(0, 8).map((p) => ({ period: (p.name ?? p.productId).slice(0, 22), ventes: Number(p.totalQty ?? 0) }));

  // Paiements groupés par méthode/fournisseur
  const paymentRows = payments?.items ?? [];
  const byMethodMap = new Map<string, number>();
  for (const p of paymentRows) {
    const key = p.method === 'mobile_money'
      ? METHOD_LABELS[`mobile_money_${p.provider === 'orange' ? 'orange' : 'mtn'}`]
      : METHOD_LABELS[p.method] ?? p.method;
    byMethodMap.set(key, (byMethodMap.get(key) ?? 0) + 1);
  }
  const methodData = Array.from(byMethodMap.entries()).map(([x, value]) => ({ x, value }));

  // Litiges par statut
  const disputeMap = new Map<string, number>();
  for (const d of disputes?.items ?? []) disputeMap.set(d.status, (disputeMap.get(d.status) ?? 0) + 1);
  const disputeData = Array.from(disputeMap.entries()).map(([x, value]) => ({ x: DISPUTE_LABELS[x] ?? x, value }));

  const pendingPayments = paymentRows.filter((p) => p.status === 'pending' || p.status === 'processing').length;
  const openDisputes = (disputes?.items ?? []).filter((d) => d.status === 'open' || d.status === 'under_review').length;
  const activePromos = (promos ?? []).filter((p) => p.isActive).length;
  const pendingCommissions = Number(
    (commissionsSummary ?? []).find((s) => s.status === 'pending')?.total ?? 0,
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Tableau de bord plateforme</h1>
        <p className="text-sm text-muted-foreground">
          Contrôle global — GMV, commandes, paiements, conversion, litiges, commissions.
        </p>
      </header>

      {/* KPI business */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="GMV" value={formatPrice(gmv)} icon={<CreditCard className="h-4 w-4" />} tone="primary" />
        <KpiCard label="Commandes" value={ordersTotal} icon={<ShoppingCart className="h-4 w-4" />} tone="primary" />
        <KpiCard
          label="Panier moyen"
          value={ordersTotal > 0 ? formatPrice(gmv / ordersTotal) : '\u2014'}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="success"
        />
        <KpiCard label="Recherches" value={searches} icon={<Search className="h-4 w-4" />} tone="primary" />
        <KpiCard
          label="Conversion"
          value={`${conversionPct.toFixed(1)}%`}
          hint="Recherche → commande"
          icon={<Percent className="h-4 w-4" />}
          tone="accent"
        />
        <KpiCard
          label="Note moyenne"
          value={avgRating > 0 ? `${avgRating.toFixed(1)}/5` : '\u2014'}
          hint={`${Number(conversion?.reviews?.totalReviews ?? 0)} avis`}
          icon={<Star className="h-4 w-4" />}
          tone="accent"
        />
      </div>

      {/* Santé opérationnelle */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Paiements en attente"
          value={pendingPayments}
          hint="À réconcilier"
          icon={<CreditCard className="h-4 w-4" />}
          tone="accent"
        />
        <KpiCard
          label="Litiges ouverts"
          value={openDisputes}
          hint="À arbitrer sous 5 j"
          icon={<Scale className="h-4 w-4" />}
          tone="accent"
        />
        <KpiCard
          label="Promotions actives"
          value={activePromos}
          icon={<Percent className="h-4 w-4" />}
          tone="success"
        />
        <KpiCard
          label="Commissions en attente"
          value={formatPrice(pendingCommissions)}
          icon={<Ban className="h-4 w-4" />}
          tone="primary"
        />
      </div>

      {/* Graphes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-2 text-sm font-semibold">CA quotidien</h2>
          <AnyChart type="splineArea" data={dayData} xKey="period" yKeys={['revenue']} seriesNames={['CA (XAF)']} height={280} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-2 text-sm font-semibold">Répartition du CA par catégorie</h2>
          <AnyChart type="treemap" data={categoryData} height={280} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-2 text-sm font-semibold">Commandes par mois</h2>
          <AnyChart type="column" data={monthOrders} xKey="period" yKeys={['commandes']} seriesNames={['Commandes']} height={280} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-2 text-sm font-semibold">Paiements par méthode</h2>
          <AnyChart type="donut" data={methodData} height={280} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-2 text-sm font-semibold">Top produits (quantités vendues)</h2>
          <AnyChart type="hbar" data={topData} xKey="period" yKeys={['ventes']} seriesNames={['Quantité']} height={300} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-2 text-sm font-semibold">Produits dormants (90 j)</h2>
          <AnyChart type="column" data={slowData} xKey="period" yKeys={['ventes']} seriesNames={['Ventes 90 j']} height={300} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">Litiges par statut</h2>
          <AnyChart type="pyramid" data={disputeData} xKey="period" yKeys={['value']} seriesNames={['Litiges']} height={260} />
        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users strokeWidth={1.5} className="h-3 w-3" />
        Détail par organisation et rapports exportables : voir /admin/analytics et /admin/paiements.
      </p>
    </div>
  );
}

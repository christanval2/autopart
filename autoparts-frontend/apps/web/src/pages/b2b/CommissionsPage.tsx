// ── Commissions (vendeur) — chaque vendeur gère SES commissions ──
// Rôle « comptable » supprimé : lecture des commissions de SON org
// (scopée côté serveur), validation/paiement gérés par la plateforme.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, CardContent, EmptyState, Skeleton, StatusBadge } from '@autoparts/ui';
import { commissionsApi } from '@autoparts/api';
import { formatDate, formatPrice } from '@autoparts/utils';

interface CommissionRow {
  id: string;
  ratePct?: number;
  baseAmount?: number;
  commissionAmount?: number;
  currency?: string;
  status?: 'pending' | 'validated' | 'paid';
  paidAt?: string | null;
  createdAt?: string;
  order?: { id: string; orderNumber?: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'À valider',
  validated: 'Validée',
  paid: 'Payée',
};

export default function CommissionsVendeurPage() {
  const [page] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['b2b', 'commissions', page],
    queryFn: () => commissionsApi.list(page, 20),
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['b2b', 'commissions', 'summary'],
    queryFn: commissionsApi.summary,
  });

  // Summary brut : [{status, total, count}] par statut
  const byStatus: Record<string, { total: number; count: number }> = {};
  (Array.isArray(summary) ? summary : []).forEach((s: { status?: string; total?: string; count?: string }) => {
    if (s.status) byStatus[s.status] = { total: Number(s.total ?? 0), count: Number(s.count ?? 0) };
  });

  const rows: CommissionRow[] = (data?.items ?? []) as CommissionRow[];
  const totalDu = (byStatus.pending?.total ?? 0) + (byStatus.validated?.total ?? 0);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Mes commissions</h1>
        <p className="text-sm text-muted-foreground">
          Commission plateforme de 5 % prélevée sur chaque vente livrée — le reste vous est reversé net.
        </p>
      </header>

      {/* Résumé par statut */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { key: 'pending', label: 'À valider', tone: 'neutral' as const },
          { key: 'validated', label: 'Validées', tone: 'info' as const },
          { key: 'paid', label: 'Payées', tone: 'success' as const },
        ].map(({ key, label, tone }) => (
          <Card key={key}>
            <CardContent className="space-y-1 py-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
              {summaryLoading ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                <>
                  <div className="text-xl font-bold">
                    {formatPrice(byStatus[key]?.total ?? 0)}
                  </div>
                  <Badge tone={tone}>{byStatus[key]?.count ?? 0} commission(s)</Badge>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {totalDu > 0 && (
        <div className="rounded-input bg-primary/10 px-4 py-3 text-sm">
          <span className="font-semibold text-primary">Reste à régler à la plateforme : {formatPrice(totalDu)}</span>
          <span className="text-muted-foreground"> (commissions à valider + validées, non encore payées)</span>
        </div>
      )}

      {/* Détail par vente */}
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Aucune commission"
          description="Les commissions apparaissent automatiquement dès qu'une de vos commandes est livrée."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Commande</th>
                  <th className="px-4 py-3">Base (vente)</th>
                  <th className="px-4 py-3">Taux</th>
                  <th className="px-4 py-3">Commission</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {c.order?.orderNumber ?? c.order?.id?.slice(0, 8) ?? '—'}
                    </td>
                    <td className="px-4 py-3">{formatPrice(c.baseAmount ?? 0)}</td>
                    <td className="px-4 py-3">{Number(c.ratePct ?? 5).toFixed(1)} %</td>
                    <td className="px-4 py-3 font-semibold text-destructive">
                      −{formatPrice(c.commissionAmount ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={(c.status as never) ?? 'pending'} />
                      <span className="sr-only">{STATUS_LABEL[c.status ?? 'pending']}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.paidAt ? `payée le ${formatDate(c.paidAt)}` : formatDate(c.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

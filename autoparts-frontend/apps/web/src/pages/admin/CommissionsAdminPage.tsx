// ── Commissions (admin/accountant) ─────────────────────────────
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button } from '@autoparts/ui';
import { commissionsApi } from '@autoparts/api';
import { formatPrice } from '@autoparts/utils';
import { DataTable, type Column } from '@autoparts/ui';
import { KpiCard } from '@/components/charts/AnyChart';
import type { Commission, CommissionStatus } from '@autoparts/types';

const TONES: Record<CommissionStatus, 'accent' | 'info' | 'success' | 'neutral'> = {
  pending: 'accent',
  validated: 'info',
  paid: 'success',
  cancelled: 'neutral',
};

export default function CommissionsAdminPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data: summary } = useQuery({
    queryKey: ['admin', 'commissions', 'summary'],
    queryFn: () => commissionsApi.summary(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'commissions', page],
    queryFn: () => commissionsApi.list(page, 10),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'commissions'] });

  const validate = useMutation({
    mutationFn: (id: string) => commissionsApi.validate(id),
    onSuccess: () => { toast.success('Commission validée'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const pay = useMutation({
    mutationFn: (id: string) => commissionsApi.markPaid(id),
    onSuccess: () => { toast.success('Commission marquée payée'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<Commission>[] = [
    { key: 'orderId', header: 'Commande', render: (c) => <span className="font-mono text-xs">{c.orderId?.slice(0, 8)}…</span> },
    { key: 'sellerOrgId', header: 'Vendeur', render: (c) => <span className="font-mono text-xs">{c.sellerOrgId?.slice(0, 8) ?? '—'}…</span> },
    { key: 'rate', header: 'Taux', render: (c) => (c.rate != null ? `${c.rate}%` : '—') },
    { key: 'amount', header: 'Montant', render: (c) => formatPrice(c.amount) },
    { key: 'status', header: 'Statut', render: (c) => <Badge tone={TONES[c.status]}>{c.status}</Badge> },
    {
      key: 'actions',
      header: '',
      render: (c) => (
        <div className="flex gap-2">
          {c.status === 'pending' && (
            <Button size="sm" variant="outline" onClick={() => validate.mutate(c.id)}>Valider</Button>
          )}
          {c.status === 'validated' && (
            <Button size="sm" onClick={() => pay.mutate(c.id)}>Marquer payée</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Commissions</h1>
        <p className="text-sm text-muted-foreground">Commission prélevée sur chaque vente, reversement net au vendeur.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="En attente"
          value={formatPrice(Number(((summary ?? [])).find((s) => s.status === 'pending')?.total ?? 0))}
        />
        <KpiCard
          label="Validées"
          value={formatPrice(Number(((summary ?? [])).find((s) => s.status === 'validated')?.total ?? 0))}
        />
        <KpiCard
          label="Payées"
          value={formatPrice(Number(((summary ?? [])).find((s) => s.status === 'paid')?.total ?? 0))}
        />
      </div>

      <DataTable
        columns={columns}
        rows={(data?.items as Commission[]) ?? []}
        rowKey={(c) => c.id}
        loading={isLoading}
        emptyLabel="Aucune commission"
        page={page}
        total={data?.pagination?.total}
        limit={10}
        onPageChange={setPage}
      />
    </div>
  );
}

// ── Paiements (comptabilité admin) ─────────────────────────────
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, StatusBadge } from '@autoparts/ui';
import { paymentsApi } from '@autoparts/api';
import { formatDateTime, formatPrice } from '@autoparts/utils';
import { DataTable, type Column } from '@autoparts/ui';
import { getBlob } from '@autoparts/api';
import type { Payment } from '@autoparts/types';

export default function PaiementsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'payments', page],
    queryFn: () => paymentsApi.list(page, 10),
    placeholderData: keepPreviousData,
  });

  const confirm = useMutation({
    mutationFn: (id: string) => paymentsApi.confirmManual(id),
    onSuccess: () => {
      toast.success('Paiement confirmé');
      void qc.invalidateQueries({ queryKey: ['admin', 'payments'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = async () => {
    try {
      const blob = await getBlob('/exports/payments?format=csv');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'paiements.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message ?? 'Export indisponible');
    }
  };

  const columns: Column<Payment>[] = [
    { key: 'gatewayRef', header: 'Référence', render: (p) => <span className="font-mono text-xs">{p.gatewayRef}</span> },
    { key: 'orderId', header: 'Commande', render: (p) => <span className="font-mono text-xs">{p.orderId?.slice(0, 8)}…</span> },
    {
      key: 'method',
      header: 'Méthode',
      render: (p) =>
        p.method === 'mobile_money'
          ? `Mobile Money (${p.provider === 'mtn' ? 'MTN' : 'Orange'})`
          : p.method,
    },
    { key: 'amount', header: 'Montant', render: (p) => formatPrice(p.amount) },
    { key: 'status', header: 'Statut', render: (p) => <StatusBadge status={p.status} /> },
    { key: 'createdAt', header: 'Date', render: (p) => formatDateTime(p.createdAt) },
    {
      key: 'actions',
      header: '',
      render: (p) =>
        p.status === 'pending' || p.status === 'processing' ? (
          <Button size="sm" variant="outline" onClick={() => confirm.mutate(p.id)}>
            Confirmer
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Paiements</h1>
          <p className="text-sm text-muted-foreground">
            Suivi comptable — MoMo, Orange Money, virements. Confirmation manuelle des virements.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void exportCsv()}>
          Export comptable (CSV)
        </Button>
      </header>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(p) => p.id}
        loading={isLoading}
        emptyLabel="Aucun paiement"
        page={page}
        total={data?.pagination?.total}
        limit={10}
        onPageChange={setPage}
      />
    </div>
  );
}

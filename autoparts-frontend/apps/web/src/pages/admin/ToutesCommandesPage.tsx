// ── Toutes les commandes (admin) + transitions de statut ──────
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, Select, StatusBadge, Modal } from '@autoparts/ui';
import { ordersApi } from '@autoparts/api';
import { formatDateTime, formatPrice } from '@autoparts/utils';
import { DataTable, type Column } from '@autoparts/ui';
import type { Order, OrderStatus } from '@autoparts/types';

const STATUSES: OrderStatus[] = ['draft', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

export default function ToutesCommandesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [detail, setDetail] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState<OrderStatus>('confirmed');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'orders', page, status],
    queryFn: () => ordersApi.list({ page, limit: 10, status: status || undefined }),
    placeholderData: keepPreviousData,
  });

  const changeStatus = useMutation({
    mutationFn: (o: Order) => ordersApi.updateStatus(o.id, newStatus),
    onSuccess: () => {
      toast.success('Statut mis à jour — notification envoyée au client');
      setDetail(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<Order>[] = [
    { key: 'orderNumber', header: 'N°', render: (o) => <span className="font-mono text-sm">{o.orderNumber}</span> },
    { key: 'createdAt', header: 'Date', render: (o) => formatDateTime(o.orderedAt ?? o.createdAt) },
    { key: 'channel', header: 'Canal', render: (o) => o.channel.toUpperCase() },
    { key: 'status', header: 'Statut', render: (o) => <StatusBadge status={o.status} /> },
    { key: 'totalAmount', header: 'Total', className: 'text-right', render: (o) => formatPrice(o.totalAmount) },
    {
      key: 'actions',
      header: '',
      render: (o) => (
        <Button size="sm" variant="ghost" onClick={((e: MouseEvent) => { e.stopPropagation(); setDetail(o); setNewStatus(o.status as OrderStatus); }) as never}>
          Gérer
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Commandes</h1>
          <p className="text-sm text-muted-foreground">Machine à états : draft → confirmed → processing → shipped → delivered.</p>
        </div>
        <Select className="w-48" value={status} onChange={(e) => { setStatus(e.target.value as OrderStatus | ''); setPage(1); }}>
          <option value="">Tous les statuts</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </header>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(o) => o.id}
        loading={isLoading}
        page={page}
        total={data?.pagination?.total}
        limit={10}
        onPageChange={setPage}
        onRowClick={(row) => setDetail(row)}
      />

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={`Commande ${detail?.orderNumber ?? ''}`}>
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Canal : </span>{detail.channel.toUpperCase()}</div>
              <div><span className="text-muted-foreground">Total : </span>{formatPrice(detail.totalAmount)}</div>
            </div>
            <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value as OrderStatus)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>Fermer</Button>
              <Button size="sm" loading={changeStatus.isPending} onClick={() => changeStatus.mutate(detail)}>
                Appliquer le statut
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

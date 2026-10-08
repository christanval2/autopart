// ── Commandes entrantes (vendeur) : préparation et expédition ──
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, Input, Select, StatusBadge, Modal } from '@autoparts/ui';
import { ordersApi, shipmentsApi } from '@autoparts/api';
import { formatDateTime, formatPrice } from '@autoparts/utils';
import { DataTable, type Column } from '@autoparts/ui';
import type { Order, OrderStatus } from '@autoparts/types';

export default function CommandesEntrantesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Order | null>(null);
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['b2b', 'orders', 'incoming', page],
    queryFn: () => ordersApi.list({ page, limit: 10 }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['b2b', 'orders'] });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => ordersApi.updateStatus(id, status),
    onSuccess: () => {
      toast.success('Statut mis à jour — client notifié');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createShipment = useMutation({
    mutationFn: () => shipmentsApi.create({ orderId: detail!.id, carrier, trackingNumber }),
    onSuccess: () => {
      toast.success('Expédition créée — email de suivi envoyé au client');
      setDetail(null);
      setCarrier('');
      setTrackingNumber('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<Order>[] = [
    { key: 'orderNumber', header: 'N°', render: (o) => <span className="font-mono text-sm">{o.orderNumber}</span> },
    { key: 'createdAt', header: 'Reçue le', render: (o) => formatDateTime(o.orderedAt ?? o.createdAt) },
    { key: 'channel', header: 'Canal', render: (o) => o.channel.toUpperCase() },
    { key: 'status', header: 'Statut', render: (o) => <StatusBadge status={o.status} /> },
    { key: 'totalAmount', header: 'Total', className: 'text-right', render: (o) => formatPrice(o.totalAmount) },
    {
      key: 'actions',
      header: '',
      render: (o) => (
        <div className="flex gap-2">
          {o.status === 'confirmed' && (
            <Button size="sm" variant="outline" onClick={((e: MouseEvent) => { e.stopPropagation(); setStatus.mutate({ id: o.id, status: 'processing' }); }) as never}>
              Préparer
            </Button>
          )}
          {o.status === 'processing' && (
            <Button size="sm" onClick={((e: MouseEvent) => { e.stopPropagation(); setDetail(o); }) as never}>
              Expédier
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Commandes entrantes</h1>
        <p className="text-sm text-muted-foreground">
          Cycle : confirmée → en traitement → expédiée → livrée. Le stock est réservé à la confirmation.
        </p>
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

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={`Expédier ${detail?.orderNumber ?? ''}`}>
        <div className="space-y-3">
          <label className="mb-1 block text-sm font-medium">Transporteur</label>
          <Select value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            <option value="">Choisir…</option>
            <option value="Campost">Campost</option>
            <option value="DHL">DHL</option>
            <option value="Express Union">Express Union</option>
            <option value="Livraison propre">Livraison propre (magasin)</option>
          </Select>
          <label className="mb-1 block text-sm font-medium">Numéro de suivi</label>
          <Input
            placeholder="Ex. CP123456789CM"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>Annuler</Button>
            <Button
              size="sm"
              loading={createShipment.isPending}
              disabled={!carrier}
              onClick={() => createShipment.mutate()}
            >
              Créer l'expédition
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

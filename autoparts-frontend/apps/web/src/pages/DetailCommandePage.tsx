import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {Skeleton, Button, Card, CardContent, CardHeader, CardTitle, StatusBadge, Textarea, Modal } from '@autoparts/ui';
import { ordersApi, disputesApi, shipmentsApi, getBlob } from '@autoparts/api';
import { formatDateTime, formatPrice } from '@autoparts/utils';
import type { OrderStatus } from '@autoparts/types';
import { ShipmentRouteMap, cityCoords, STATUS_LABEL } from '@/components/logistics/ShipmentRouteMap';

const TIMELINE: OrderStatus[] = ['draft', 'confirmed', 'processing', 'shipped', 'delivered'];

export default function DetailCommandePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeDesc, setDisputeDesc] = useState('');

  const { data: order, isLoading } = useQuery({
    queryKey: ['orders', id],
    queryFn: () => ordersApi.byId(id!),
    enabled: Boolean(id),
  });

  // Première expédition de la commande → trajet public enrichi (orig/dest/progression)
  const activeShipment = (order?.shipments ?? []).find((s) => s.trackingNumber);
  const { data: tracked } = useQuery({
    queryKey: ['shipments', 'track', activeShipment?.trackingNumber],
    queryFn: () => shipmentsApi.track(activeShipment!.trackingNumber!),
    enabled: Boolean(activeShipment?.trackingNumber),
  });

  const confirmOrder = useMutation({
    mutationFn: () => ordersApi.confirm(id!),
    onSuccess: () => {
      toast.success('Commande confirmée');
      void qc.invalidateQueries({ queryKey: ['orders', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openDispute = useMutation({
    mutationFn: () => disputesApi.create({ orderId: id!, reason: disputeReason, description: disputeDesc }),
    onSuccess: () => {
      toast.success('Litige ouvert — notre équipe vous répond sous 5 jours ouvrés');
      setDisputeOpen(false);
      setDisputeReason('');
      setDisputeDesc('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadInvoice = async () => {
    try {
      const blob = await getBlob(`/invoices/${id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `facture-${order?.orderNumber ?? id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message ?? 'Facture indisponible');
    }
  };

  if (isLoading || !order) {
    return <div className="space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>;
  }

  const statusIndex = TIMELINE.indexOf(order.status as OrderStatus);
  const cancellable = ['draft', 'confirmed', 'processing'].includes(order.status);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/commandes" className="text-sm text-primary hover:underline">← Mes commandes</Link>
          <h1 className="text-2xl font-bold">Commande {order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">Passée le {formatDateTime(order.orderedAt ?? order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </header>

      {/* Timeline */}
      <Card>
        <CardContent className="py-6">
          <ol className="flex items-center">
            {TIMELINE.map((s, i) => (
              <li key={s} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      order.status === 'cancelled'
                        ? 'bg-muted text-muted-foreground'
                        : i <= statusIndex
                          ? 'bg-success text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span className="mt-1 text-[10px] font-medium uppercase text-muted-foreground">
                    {s === 'draft' ? 'Brouillon' : s === 'confirmed' ? 'Confirmée' : s === 'processing' ? 'Traitement' : s === 'shipped' ? 'Expédiée' : 'Livrée'}
                  </span>
                </div>
                {i < TIMELINE.length - 1 && (
                  <div className={`mx-2 h-0.5 flex-1 ${i < statusIndex ? 'bg-success' : 'bg-muted'}`} />
                )}
              </li>
            ))}
          </ol>
          {order.status === 'cancelled' && (
            <p className="mt-3 text-center text-sm text-destructive">Cette commande a été annulée.</p>
          )}
        </CardContent>
      </Card>

      {/* Suivi du colis : trajet sur carte */}
      {tracked && tracked.status !== 'returned' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Suivi du colis</CardTitle>
            <Link
              to={`/suivi/${encodeURIComponent(tracked.trackingNumber ?? '')}`}
              className="text-sm text-primary hover:underline"
            >
              Page de suivi complète →
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Transporteur : </span>
                <span className="font-semibold">{tracked.carrier ?? '—'}</span>
                <span className="text-muted-foreground"> · N° </span>
                <span className="font-mono">{tracked.trackingNumber}</span>
              </div>
              <div className="text-muted-foreground">
                {tracked.originCity ?? '—'} → {tracked.destinationCity ?? '—'} ·{' '}
                <span className="font-semibold text-foreground">{Math.round((tracked.progress ?? 0) * 100)}%</span> du trajet
              </div>
            </div>
            <ShipmentRouteMap
              origin={cityCoords(tracked.originCity)}
              destination={cityCoords(tracked.destinationCity)}
              progress={tracked.progress ?? 0}
              status={tracked.status}
              originLabel={tracked.originWarehouse ?? tracked.originCity ?? 'Dépôt'}
              destinationLabel={tracked.destinationLabel ?? tracked.destinationCity ?? 'Adresse de livraison'}
              trackingNumber={tracked.trackingNumber ?? undefined}
              height={320}
            />
            <p className="text-xs text-muted-foreground">
              Statut « {STATUS_LABEL[tracked.status] ?? tracked.status} » — position estimée sur l'axe
              {tracked.originCity ? ` ${tracked.originCity} → ${tracked.destinationCity ?? ''}` : ''}.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lignes */}
      <Card>
        <CardHeader><CardTitle>Articles</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(order.lines ?? []).map((line) => (
            <div key={line.id} className="flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">
                  {String((line.productSnapshot as Record<string, unknown>).name ?? 'Article')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {String((line.productSnapshot as Record<string, unknown>).sku ?? '')} · Qté {line.quantity}
                </div>
              </div>
              <div className="font-semibold">{formatPrice(line.lineTotal)}</div>
            </div>
          ))}
          <div className="space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between"><span>Sous-total</span><span>{formatPrice(order.subtotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>TVA</span><span>{formatPrice(order.taxAmount)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Livraison</span><span>{formatPrice(order.shippingCost)}</span></div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-success"><span>Remise</span><span>-{formatPrice(order.discountAmount)}</span></div>
            )}
            <div className="flex justify-between pt-1 text-base font-bold">
              <span>Total</span><span>{formatPrice(order.totalAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {order.status === 'draft' && (
            <Button loading={confirmOrder.isPending} onClick={() => confirmOrder.mutate()}>
              Confirmer la commande
            </Button>
          )}
          <Button variant="outline" onClick={() => void downloadInvoice()}>
            Télécharger la facture (PDF)
          </Button>
          {!['cancelled', 'refunded'].includes(order.status) && (
            <Button variant="outline" onClick={() => setDisputeOpen(true)}>
              Ouvrir un litige
            </Button>
          )}
          {cancellable && (
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await ordersApi.updateStatus(order.id, 'cancelled');
                  toast.success('Commande annulée — le stock sera libéré');
                  void qc.invalidateQueries({ queryKey: ['orders', id] });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Annuler la commande
            </Button>
          )}
        </CardContent>
      </Card>

      <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title="Ouvrir un litige">
        <div className="space-y-3">
          <Textarea
            placeholder="Motif (produit non reçu, article endommagé…)"
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
          />
          <Textarea
            placeholder="Description détaillée"
            value={disputeDesc}
            onChange={(e) => setDisputeDesc(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDisputeOpen(false)}>Annuler</Button>
            <Button
              size="sm"
              loading={openDispute.isPending}
              disabled={!disputeReason.trim()}
              onClick={() => openDispute.mutate()}
            >
              Ouvrir le litige
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

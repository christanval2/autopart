// ── Bons de commande fournisseur (approvisionnement) ──────────
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, EmptyState, Input, Modal, Select } from '@autoparts/ui';
import { purchaseOrdersApi, productsApi, orgsApi, stockApi } from '@autoparts/api';
import { formatDate, formatPrice } from '@autoparts/utils';
import type { PurchaseOrder } from '@autoparts/types';

interface DraftLine {
  variantId: string;
  label: string;
  sku: string;
  quantity: string;
  unitCost: string;
}

export default function BonsDeCommandePage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ variantId: '', label: '', sku: '', quantity: '1', unitCost: '' }]);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [receiveLines, setReceiveLines] = useState<Record<string, string>>({});

  const { data: orders = [] } = useQuery({
    queryKey: ['b2b', 'purchase-orders'],
    queryFn: purchaseOrdersApi.list,
  });

  const { data: myProducts } = useQuery({
    queryKey: ['b2b', 'products', 'for-po'],
    queryFn: () => productsApi.list({ mine: true, limit: 100 }),
  });
  const { data: orgs } = useQuery({
    queryKey: ['admin', 'orgs', 'all-for-po'],
    queryFn: () => orgsApi.list(1, 100),
  });
  // Entrepôt de réception : obligatoire (le backend y met le stock à jour)
  const { data: warehouses = [] } = useQuery({
    queryKey: ['b2b', 'warehouses'],
    queryFn: stockApi.warehouses,
  });

  const variants = (myProducts?.items ?? []).flatMap((p) =>
    (p.variants ?? []).map((v) => ({
      id: v.id,
      sku: v.variantSku,
      label: `${p.name} — ${v.variantSku}`,
      cost: Number(v.costPrice ?? v.priceOverride ?? p.basePrice),
    })),
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['b2b', 'purchase-orders'] });

  const create = useMutation({
    mutationFn: () => {
      const supplier = (orgs?.items ?? []).find((o) => o.id === supplierId);
      if (!supplier) throw new Error('Choisissez un fournisseur');
      if (!warehouseId) throw new Error('Choisissez un entrepôt de réception');
      return purchaseOrdersApi.create({
        supplierName: supplier.name,
        warehouseId,
        lines: lines
          .filter((l) => l.variantId && Number(l.quantity) > 0)
          .map((l) => ({
            variantId: l.variantId,
            sku: l.sku,
            quantityOrdered: Number(l.quantity),
            unitCost: Number(l.unitCost || 0),
          })),
      });
    },
    onSuccess: () => {
      toast.success('Bon de commande créé');
      setCreateOpen(false);
      setLines([{ variantId: '', label: '', sku: '', quantity: '1', unitCost: '' }]);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: (id: string) => purchaseOrdersApi.send(id),
    onSuccess: () => { toast.success('Bon de commande envoyé au fournisseur'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const receive = useMutation({
    mutationFn: () =>
      purchaseOrdersApi.receive(
        receiveTarget!.id,
        Object.entries(receiveLines)
          .filter(([, qty]) => Number(qty) > 0)
          .map(([variantId, qty]) => ({ variantId, quantityReceived: Number(qty) })),
      ),
    onSuccess: () => {
      toast.success('Réception enregistrée — stock mis à jour automatiquement');
      setReceiveTarget(null);
      setReceiveLines({});
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bons de commande</h1>
          <p className="text-sm text-muted-foreground">
            Approvisionnement fournisseurs — la réception met le stock à jour automatiquement.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ Nouveau bon</Button>
      </header>

      {orders.length === 0 ? (
        <EmptyState title="Aucun bon de commande" description="Créez un bon pour réapprovisionner votre stock." />
      ) : (
        <div className="space-y-3">
          {(orders as PurchaseOrder[]).map((po) => {
            const poLines = po.lines ?? po.items ?? [];
            const total = poLines.reduce((s, i) => s + (i.quantityOrdered ?? i.quantity ?? 0) * i.unitCost, 0);
            return (
              <Card key={po.id}>
                <CardContent className="flex flex-wrap items-center gap-3 py-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium">BC {po.poNumber ?? po.reference ?? po.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">
                      {poLines.length} article(s) · {po.supplierName ?? 'Fournisseur'} · {formatPrice(po.totalAmount ?? total)} · {formatDate(po.createdAt)}
                    </div>
                  </div>
                  {po.status && <Badge tone={po.status === 'received' ? 'success' : po.status === 'sent' ? 'info' : 'neutral'}>{po.status}</Badge>}
                  {(!po.status || po.status === 'draft') && (
                    <Button size="sm" variant="outline" onClick={() => send.mutate(po.id)}>Envoyer</Button>
                  )}
                  {po.status === 'sent' && (
                    <Button size="sm" onClick={() => { setReceiveTarget(po); setReceiveLines({}); }}>Réceptionner</Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau bon de commande" className="max-w-2xl">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Fournisseur…</option>
              {(orgs?.items ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
            <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Entrepôt de réception…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} — {w.city}</option>)}
            </Select>
          </div>

          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_120px] gap-2">
              <Select
                value={l.variantId}
                onChange={(e) => {
                  const v = variants.find((x) => x.id === e.target.value);
                  const next = [...lines];
                  next[i] = {
                    variantId: e.target.value,
                    label: v?.label ?? '',
                    sku: v?.sku ?? '',
                    quantity: l.quantity,
                    unitCost: l.unitCost || String(v?.cost ?? ''),
                  };
                  setLines(next);
                }}
              >
                <option value="">Choisir une variante…</option>
                {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </Select>
              <Input
                type="number" min={1} placeholder="Qté" value={l.quantity}
                onChange={(e) => { const next = [...lines]; next[i] = { ...l, quantity: e.target.value }; setLines(next); }}
              />
              <Input
                type="number" min={0} placeholder="Coût unit." value={l.unitCost}
                onChange={(e) => { const next = [...lines]; next[i] = { ...l, unitCost: e.target.value }; setLines(next); }}
              />
            </div>
          ))}
          <Button
            size="sm" variant="ghost"
            onClick={() => setLines([...lines, { variantId: '', label: '', sku: '', quantity: '1', unitCost: '' }])}
          >
            + Ajouter une ligne
          </Button>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button
              size="sm" loading={create.isPending}
              disabled={!lines.some((l) => l.variantId)}
              onClick={() => create.mutate()}
            >
              Créer le bon
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(receiveTarget)} onClose={() => setReceiveTarget(null)} title="Réception (totale ou partielle)">
        <div className="space-y-3">
          {(receiveTarget?.lines ?? receiveTarget?.items ?? []).map((i) => (
            <div key={i.variantId} className="flex items-center gap-2">
              <span className="flex-1 text-sm">
                {i.sku ?? i.variantId.slice(0, 8)}… (commandé : {i.quantityOrdered}, reçu : {i.quantityReceived ?? 0})
              </span>
              <Input
                className="w-24"
                type="number"
                min={0}
                placeholder="Reçu"
                value={receiveLines[i.variantId] ?? ''}
                onChange={(e) => setReceiveLines({ ...receiveLines, [i.variantId]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReceiveTarget(null)}>Annuler</Button>
            <Button size="sm" loading={receive.isPending} onClick={() => receive.mutate()}>
              Confirmer la réception
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

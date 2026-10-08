// ── Gestion du stock : niveaux, alertes, mouvements, transferts,
//    entrepôts, inventaires ─────────────────────────────────────
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Plus } from 'lucide-react';
import { Skeleton, Badge, Button, Card, CardContent, EmptyState, Input, Modal, Select, DataTable } from '@autoparts/ui';
import { stockApi, stockAuditsApi } from '@autoparts/api';
import { formatDateTime, formatPrice } from '@autoparts/utils';
import type { StockLevel, StockMovement, Warehouse } from '@autoparts/types';

type Tab = 'levels' | 'alerts' | 'movements' | 'warehouses' | 'audits';

export default function GestionStockPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('levels');
  const [warehouseId, setWarehouseId] = useState('');
  const [page, setPage] = useState(1);

  // Modales
  const [adjustOpen, setAdjustOpen] = useState<StockLevel | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('correction');
  const [transferOpen, setTransferOpen] = useState<StockLevel | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [whForm, setWhForm] = useState({ name: '', location: '' });
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditWarehouse, setAuditWarehouse] = useState('');

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['b2b', 'stock'] });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['b2b', 'stock', 'warehouses'],
    queryFn: stockApi.warehouses,
  });

  const { data: levels, isLoading: levelsLoading } = useQuery({
    queryKey: ['b2b', 'stock', 'levels', warehouseId, page],
    queryFn: () => stockApi.levels({ warehouseId: warehouseId || undefined, page, limit: 10 }),
    placeholderData: keepPreviousData,
    enabled: tab === 'levels',
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['b2b', 'stock', 'alerts'],
    queryFn: stockApi.alerts,
    enabled: tab === 'alerts',
  });

  const { data: movements } = useQuery({
    queryKey: ['b2b', 'stock', 'movements', page],
    queryFn: () => stockApi.movements({ page, limit: 10 }),
    placeholderData: keepPreviousData,
    enabled: tab === 'movements',
  });

  const { data: audits = [] } = useQuery({
    queryKey: ['b2b', 'stock', 'audits'],
    queryFn: stockAuditsApi.list,
    enabled: tab === 'audits',
  });

  const adjust = useMutation({
    mutationFn: () =>
      stockApi.adjust({
        warehouseId: adjustOpen!.warehouseId,
        variantId: adjustOpen!.variantId,
        delta: Number(adjustQty),
        reason: adjustReason,
      }),
    onSuccess: () => {
      toast.success('Stock ajusté — mouvement journalisé');
      setAdjustOpen(null);
      setAdjustQty('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transfer = useMutation({
    mutationFn: () =>
      stockApi.transfer({
        fromWarehouseId: transferOpen!.warehouseId,
        toWarehouseId: transferTo,
        variantId: transferOpen!.variantId,
        quantity: Number(transferQty),
      }),
    onSuccess: () => {
      toast.success('Transfert effectué (atomique)');
      setTransferOpen(null);
      setTransferQty('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createWarehouse = useMutation({
    mutationFn: () => stockApi.createWarehouse(whForm),
    onSuccess: () => {
      toast.success('Entrepôt créé');
      setWarehouseOpen(false);
      setWhForm({ name: '', location: '' });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createAudit = useMutation({
    mutationFn: () => stockAuditsApi.create({ warehouseId: auditWarehouse }),
    onSuccess: () => {
      toast.success('Session d\u2019inventaire créée');
      setAuditOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startAudit = useMutation({
    mutationFn: (id: string) => stockAuditsApi.start(id),
    onSuccess: () => { toast.success('Inventaire démarré'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'levels', label: 'Niveaux' },
    { key: 'alerts', label: `Alertes` },
    { key: 'movements', label: 'Mouvements' },
    { key: 'warehouses', label: 'Entrepôts' },
    { key: 'audits', label: 'Inventaires' },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gestion du stock</h1>
          <p className="text-sm text-muted-foreground">Multi-entrepôts — réservé vs disponible en temps réel.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setWarehouseOpen(true)}>
          <Plus strokeWidth={1.5} className="h-4 w-4" /> Entrepôt
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? 'primary' : 'outline'} onClick={() => setTab(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>

      {/* Niveaux */}
      {tab === 'levels' && (
        <div className="space-y-4">
          <Select className="w-64" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setPage(1); }}>
            <option value="">Tous les entrepôts</option>
            {(warehouses as Warehouse[]).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <DataTable
            columns={[
              {
                key: 'variant',
                header: 'Variante',
                render: (s) => (
                  <div>
                    <div className="font-medium">{s.variant?.variantSku ?? s.variantId.slice(0, 8) + '…'}</div>
                    {s.variant?.product?.name && (
                      <div className="text-xs text-muted-foreground">{s.variant.product.name}</div>
                    )}
                  </div>
                ),
              },
              { key: 'warehouse', header: 'Entrepôt', render: (s) => s.warehouse?.name ?? '—' },
              { key: 'qtyOnHand', header: 'Physique', className: 'text-right' },
              { key: 'qtyReserved', header: 'Réservé', className: 'text-right' },
              {
                key: 'available',
                header: 'Disponible',
                className: 'text-right',
                render: (s) => {
                  const available = s.qtyOnHand - s.qtyReserved;
                  const low = s.reorderPoint != null && available <= s.reorderPoint;
                  return <span className={`font-semibold ${low ? 'text-destructive' : 'text-success'}`}>{available}</span>;
                },
              },
              { key: 'reorderPoint', header: 'Seuil', className: 'text-right', render: (s) => s.reorderPoint ?? '—' },
              {
                key: 'actions',
                header: '',
                render: (s) => (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setAdjustOpen(s); setAdjustQty(''); }}>Ajuster</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setTransferOpen(s); setTransferTo(''); setTransferQty(''); }}>Transférer</Button>
                  </div>
                ),
              },
            ]}
            rows={(levels?.items ?? []) as StockLevel[]}
            rowKey={(s) => s.id}
            loading={levelsLoading}
            emptyLabel="Aucun stock — créez un entrepôt puis ajustez les niveaux"
            page={page}
            total={levels?.pagination?.total}
            limit={10}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Alertes */}
      {tab === 'alerts' && ((alerts as StockLevel[]).length === 0 ? (
        <EmptyState title="Aucune alerte" description="Tous les stocks sont au-dessus des seuils de réapprovisionnement." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(alerts as StockLevel[]).map((a) => (
            <Card key={a.id} className="border-accent/40">
              <CardContent className="flex items-center gap-3 py-3">
                <AlertTriangle strokeWidth={1.5} className="h-5 w-5 text-accent" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{a.variant?.variantSku ?? a.variantId.slice(0, 8)}…</div>
                  <div className="text-xs text-muted-foreground">{a.warehouse?.name} — disponible : {a.qtyOnHand - a.qtyReserved} (seuil {a.reorderPoint ?? 5})</div>
                </div>
                <Badge tone="accent">Réapprovisionner</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}

      {/* Mouvements */}
      {tab === 'movements' && (
        <DataTable
          columns={[
            { key: 'createdAt', header: 'Date', render: (m) => formatDateTime(m.createdAt) },
            { key: 'variantId', header: 'Variante', render: (m) => <span className="font-mono text-xs">{m.variantId.slice(0, 8)}…</span> },
            { key: 'reason', header: 'Motif', render: (m) => <Badge tone="secondary">{m.reason}</Badge> },
            {
              key: 'delta',
              header: 'Δ',
              className: 'text-right',
              render: (m) => (
                <span className={`font-semibold ${m.delta >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {m.delta >= 0 ? `+${m.delta}` : m.delta}
                </span>
              ),
            },
          ]}
          rows={(movements?.items ?? []) as StockMovement[]}
          rowKey={(m) => m.id}
          loading={false}
          emptyLabel="Aucun mouvement sur la période"
          page={page}
          total={movements?.pagination?.total}
          limit={10}
          onPageChange={setPage}
        />
      )}

      {/* Entrepôts */}
      {tab === 'warehouses' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(warehouses as Warehouse[]).map((w) => (
            <Card key={w.id}>
              <CardContent className="py-3">
                <div className="font-medium">{w.name}</div>
                <div className="text-xs text-muted-foreground">{w.location ?? 'Localisation non précisée'}</div>
              </CardContent>
            </Card>
          ))}
          {(warehouses as Warehouse[]).length === 0 && (
            <EmptyState title="Aucun entrepôt" description="Créez votre premier entrepôt pour gérer le stock." />
          )}
        </div>
      )}

      {/* Inventaires */}
      {tab === 'audits' && (
        <>
          <Button size="sm" onClick={() => { setAuditWarehouse((warehouses as Warehouse[])[0]?.id ?? ''); setAuditOpen(true); }}>
            + Nouvel inventaire
          </Button>
          {audits.length === 0 ? (
            <EmptyState title="Aucun inventaire" description="Comparez le stock théorique au comptage physique." />
          ) : (
            <div className="space-y-2">
              {audits.map((a) => (
                <Card key={a.id}>
                  <CardContent className="flex items-center gap-3 py-3">
                    <div className="flex-1 text-sm">
                      Inventaire {a.id.slice(0, 8)}… — {formatDateTime(a.createdAt)}
                    </div>
                    <Badge tone="neutral">{a.status ?? 'pending'}</Badge>
                    {a.status === 'pending' && (
                      <Button size="sm" variant="outline" onClick={() => startAudit.mutate(a.id)}>Démarrer</Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modale ajustement */}
      <Modal open={Boolean(adjustOpen)} onClose={() => setAdjustOpen(null)} title="Ajuster le stock">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {adjustOpen?.variant?.variantSku ?? ''} — delta appliqué (ex. -5 ou +20).
          </p>
          <Input type="number" placeholder="Delta" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} />
          <Select value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)}>
            <option value="correction">Correction</option>
            <option value="damage">Casse</option>
            <option value="return">Retour</option>
            <option value="purchase">Réception fournisseur</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdjustOpen(null)}>Annuler</Button>
            <Button size="sm" loading={adjust.isPending} disabled={!adjustQty} onClick={() => adjust.mutate()}>Appliquer</Button>
          </div>
        </div>
      </Modal>

      {/* Modale transfert */}
      <Modal open={Boolean(transferOpen)} onClose={() => setTransferOpen(null)} title="Transférer du stock">
        <div className="space-y-3">
          <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
            <option value="">Entrepôt destination…</option>
            {(warehouses as Warehouse[])
              .filter((w) => w.id !== transferOpen?.warehouseId)
              .map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <Input type="number" min={1} placeholder="Quantité" value={transferQty} onChange={(e) => setTransferQty(e.target.value)} />
          <p className="text-xs text-muted-foreground">Transfert atomique : transaction SQL, rollback si échec.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTransferOpen(null)}>Annuler</Button>
            <Button
              size="sm" loading={transfer.isPending}
              disabled={!transferTo || !transferQty}
              onClick={() => transfer.mutate()}
            >
              Transférer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modale entrepôt */}
      <Modal open={warehouseOpen} onClose={() => setWarehouseOpen(false)} title="Nouvel entrepôt">
        <div className="space-y-3">
          <Input placeholder="Nom" value={whForm.name} onChange={(e) => setWhForm({ ...whForm, name: e.target.value })} />
          <Input placeholder="Localisation (Douala, Cameroon)" value={whForm.location} onChange={(e) => setWhForm({ ...whForm, location: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setWarehouseOpen(false)}>Annuler</Button>
            <Button size="sm" loading={createWarehouse.isPending} disabled={!whForm.name} onClick={() => createWarehouse.mutate()}>Créer</Button>
          </div>
        </div>
      </Modal>

      {/* Modale inventaire */}
      <Modal open={auditOpen} onClose={() => setAuditOpen(false)} title="Nouvel inventaire">
        <div className="space-y-3">
          <Select value={auditWarehouse} onChange={(e) => setAuditWarehouse(e.target.value)}>
            <option value="">Entrepôt…</option>
            {(warehouses as Warehouse[]).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <p className="text-xs text-muted-foreground">
            Le comptage compare le stock théorique au physique ; les écarts validés corrigent le stock.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAuditOpen(false)}>Annuler</Button>
            <Button size="sm" loading={createAudit.isPending} disabled={!auditWarehouse} onClick={() => createAudit.mutate()}>Créer</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

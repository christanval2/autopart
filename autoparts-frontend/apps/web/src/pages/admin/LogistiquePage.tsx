// ── Logistique (admin) : zones de livraison, picking, simulateur ──
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, EmptyState, Input, Modal, Select, PaginationFooter } from '@autoparts/ui';
import { pickingApi, shippingApi } from '@autoparts/api';
import { DeliveryMapPanel } from '@/components/logistics/DeliveryMapPanel';
import type { ShippingZone } from '@autoparts/types';
import type { PickList } from '@autoparts/api';

type Tab = 'map' | 'zones' | 'picking' | 'simulator';

export default function LogistiquePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('map');
  const [page, setPage] = useState(1);

  // Zones
  const [zoneOpen, setZoneOpen] = useState(false);
  const [zoneForm, setZoneForm] = useState({ name: '', type: 'city' as ShippingZone['type'], baseFee: '', perKgFee: '', freeThreshold: '', etaDays: '' });

  // Simulateur
  const [sim, setSim] = useState({ zoneId: '', weightKg: '', subtotal: '' });
  const { data: simResult } = useQuery({
    queryKey: ['shipping', 'quote', sim],
    queryFn: () => shippingApi.quote({
      zoneId: sim.zoneId || undefined,
      weightKg: sim.weightKg ? Number(sim.weightKg) : undefined,
      subtotal: sim.subtotal ? Number(sim.subtotal) : undefined,
    }),
    enabled: Boolean(sim.zoneId),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['logistics'] });

  const { data: zones = [] } = useQuery({
    queryKey: ['logistics', 'zones'],
    queryFn: shippingApi.zones,
    enabled: tab === 'zones' || tab === 'simulator',
  });

  const { data: picks } = useQuery({
    queryKey: ['logistics', 'picking', page],
    queryFn: () => pickingApi.list(page, 10),
    placeholderData: keepPreviousData,
    enabled: tab === 'picking',
  });

  const createZone = useMutation({
    mutationFn: () =>
      shippingApi.createZone({
        name: zoneForm.name,
        type: zoneForm.type,
        baseFee: zoneForm.baseFee ? Number(zoneForm.baseFee) : undefined,
        perKgFee: zoneForm.perKgFee ? Number(zoneForm.perKgFee) : undefined,
        freeThreshold: zoneForm.freeThreshold ? Number(zoneForm.freeThreshold) : undefined,
        etaDays: zoneForm.etaDays ? Number(zoneForm.etaDays) : undefined,
      }),
    onSuccess: () => {
      toast.success('Zone de livraison créée');
      setZoneOpen(false);
      setZoneForm({ name: '', type: 'city', baseFee: '', perKgFee: '', freeThreshold: '', etaDays: '' });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteZone = useMutation({
    mutationFn: (id: string) => shippingApi.deleteZone(id),
    onSuccess: () => { toast.success('Zone supprimée'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const completePick = useMutation({
    mutationFn: (id: string) => pickingApi.update(id, { status: 'completed' }),
    onSuccess: () => { toast.success('Préparation terminée'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Logistique</h1>
          <p className="text-sm text-muted-foreground">Zones de livraison, frais de port, préparation de commandes.</p>
        </div>
        {tab === 'zones' && <Button size="sm" onClick={() => setZoneOpen(true)}>+ Nouvelle zone</Button>}
      </header>

      <div className="flex gap-2">
        {([
          { key: 'map', label: 'Carte des livraisons' },
          { key: 'zones', label: 'Zones de livraison' },
          { key: 'picking', label: 'Préparation (picking)' },
          { key: 'simulator', label: 'Simulateur de frais' },
        ] as Array<{ key: Tab; label: string }>).map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? 'primary' : 'outline'} onClick={() => setTab(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>

      {tab === 'map' && <DeliveryMapPanel />}

      {tab === 'zones' && ((zones as ShippingZone[]).length === 0 ? (
        <EmptyState title="Aucune zone" description="Créez vos zones (Yaoundé, Douala, Intérieur, International…)." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(zones as ShippingZone[]).map((z) => (
            <Card key={z.id}>
              <CardContent className="space-y-1 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{z.name}</span>
                  <Badge tone="primary">{z.type}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {z.baseFee != null && <>Fixe : {z.baseFee} XAF · </>}
                  {z.perKgFee != null && <>/kg : {z.perKgFee} XAF · </>}
                  {z.freeThreshold != null && <>Gratuit dès {z.freeThreshold} XAF · </>}
                  {z.etaDays != null && <>~{z.etaDays} j</>}
                </div>
                <Button size="sm" variant="destructive" onClick={() => { if (window.confirm(`Supprimer la zone « ${z.name} » ?`)) deleteZone.mutate(z.id); }}>
                  Supprimer
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}

      {tab === 'picking' && (
        <div className="space-y-2">
          {(picks?.items ?? []).map((p: PickList) => (
            <Card key={p.id}>
              <CardContent className="flex items-center gap-3 py-3">
                <div className="flex-1 text-sm">
                  Pick list {p.id.slice(0, 8)}… — commande {p.orderId.slice(0, 8)}…
                </div>
                <Badge tone={p.status === 'completed' ? 'success' : p.status === 'in_progress' ? 'info' : 'neutral'}>
                  {p.status ?? 'pending'}
                </Badge>
                {p.status !== 'completed' && (
                  <Button size="sm" variant="outline" onClick={() => completePick.mutate(p.id)}>
                    Terminer
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
          {(picks?.items ?? []).length === 0 && (
            <EmptyState title="Aucune liste de prélèvement" description="Les pick lists sont créées depuis les commandes à préparer." />
          )}
          {(picks?.pagination?.total ?? 0) > 10 && (
            <PaginationFooter
              page={page}
              totalPages={Math.max(1, Math.ceil((picks?.pagination?.total ?? 0) / 10))}
              total={picks?.pagination?.total}
              onPageChange={setPage}
            />
          )}
        </div>
      )}

      {tab === 'simulator' && (
        <Card className="max-w-xl">
          <CardContent className="space-y-3">
            <Select value={sim.zoneId} onChange={(e) => setSim({ ...sim, zoneId: e.target.value })}>
              <option value="">Choisir une zone…</option>
              {(zones as ShippingZone[]).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Poids (kg)" type="number" value={sim.weightKg} onChange={(e) => setSim({ ...sim, weightKg: e.target.value })} />
              <Input placeholder="Sous-total (XAF)" type="number" value={sim.subtotal} onChange={(e) => setSim({ ...sim, subtotal: e.target.value })} />
            </div>
            {simResult != null && (
              <pre className="rounded-input bg-muted/50 p-3 text-xs">
                {JSON.stringify(simResult, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      )}

      <Modal open={zoneOpen} onClose={() => setZoneOpen(false)} title="Nouvelle zone de livraison">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Nom (Yaoundé centre…)" value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} />
          <Select value={zoneForm.type} onChange={(e) => setZoneForm({ ...zoneForm, type: e.target.value as ShippingZone['type'] })}>
            <option value="city">Ville</option>
            <option value="national">National</option>
            <option value="international">International</option>
          </Select>
          <Input placeholder="Frais fixe (XAF)" type="number" value={zoneForm.baseFee} onChange={(e) => setZoneForm({ ...zoneForm, baseFee: e.target.value })} />
          <Input placeholder="Frais / kg (XAF)" type="number" value={zoneForm.perKgFee} onChange={(e) => setZoneForm({ ...zoneForm, perKgFee: e.target.value })} />
          <Input placeholder="Gratuit dès (XAF)" type="number" value={zoneForm.freeThreshold} onChange={(e) => setZoneForm({ ...zoneForm, freeThreshold: e.target.value })} />
          <Input placeholder="Délai (jours)" type="number" value={zoneForm.etaDays} onChange={(e) => setZoneForm({ ...zoneForm, etaDays: e.target.value })} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setZoneOpen(false)}>Annuler</Button>
          <Button size="sm" loading={createZone.isPending} disabled={!zoneForm.name} onClick={() => createZone.mutate()}>
            Créer
          </Button>
        </div>
      </Modal>
    </div>
  );
}

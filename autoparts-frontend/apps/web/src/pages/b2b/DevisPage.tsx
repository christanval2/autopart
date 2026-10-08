// ── Devis B2B : création, envoi, acceptation/refus ─────────────
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, EmptyState, Input, Modal, Select } from '@autoparts/ui';
import { quotesApi, productsApi } from '@autoparts/api';
import { formatDate, formatPrice } from '@autoparts/utils';
import type { Quote, QuoteStatus } from '@autoparts/types';

const TONES: Record<QuoteStatus, 'neutral' | 'info' | 'success' | 'danger' | 'accent'> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  expired: 'accent',
  converted: 'success',
};

interface DraftLine {
  variantId: string;
  label: string;
  quantity: string;
  unitPrice: string;
}

export default function DevisPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'mine' | 'org'>('mine');
  const [createOpen, setCreateOpen] = useState(false);
  const [validUntil, setValidUntil] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { variantId: '', label: '', quantity: '1', unitPrice: '' },
  ]);

  const { data: mine = [] } = useQuery({ queryKey: ['b2b', 'quotes', 'mine'], queryFn: quotesApi.mine });
  const { data: org = [] } = useQuery({ queryKey: ['b2b', 'quotes', 'org'], queryFn: quotesApi.org });

  const { data: myProducts } = useQuery({
    queryKey: ['b2b', 'products', 'for-quote'],
    queryFn: () => productsApi.list({ mine: true, limit: 100 }),
  });

  const variants = (myProducts?.items ?? []).flatMap((p) =>
    (p.variants ?? []).map((v) => ({
      id: v.id,
      label: `${p.name} — ${v.variantSku}`,
      price: Number(v.priceOverride ?? p.basePrice),
    })),
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['b2b', 'quotes'] });
  };

  const create = useMutation({
    mutationFn: () =>
      quotesApi.create({
        lines: lines
          .filter((l) => l.variantId && Number(l.quantity) > 0)
          .map((l) => ({ variantId: l.variantId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice || 0) })),
        validUntil: validUntil || undefined,
      }),
    onSuccess: () => {
      toast.success('Devis créé en brouillon');
      setCreateOpen(false);
      setLines([{ variantId: '', label: '', quantity: '1', unitPrice: '' }]);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendQ = useMutation({
    mutationFn: (id: string) => quotesApi.send(id),
    onSuccess: () => { toast.success('Devis envoyé au client'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const acceptQ = useMutation({
    mutationFn: (id: string) => quotesApi.accept(id),
    onSuccess: () => { toast.success('Devis accepté'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rejectQ = useMutation({
    mutationFn: (id: string) => quotesApi.reject(id),
    onSuccess: () => { toast.success('Devis refusé'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = tab === 'mine' ? mine : org;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Devis</h1>
          <p className="text-sm text-muted-foreground">Négociation en ligne — conversion en commande en 1 clic.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={tab === 'mine' ? 'primary' : 'outline'} onClick={() => setTab('mine')}>
            Mes devis
          </Button>
          <Button size="sm" variant={tab === 'org' ? 'primary' : 'outline'} onClick={() => setTab('org')}>
            Organisation
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>+ Nouveau devis</Button>
        </div>
      </header>

      {list.length === 0 ? (
        <EmptyState title="Aucun devis" description="Créez un devis pour proposer des prix personnalisés." />
      ) : (
        <div className="space-y-3">
          {(list as Quote[]).map((q) => (
            <Card key={q.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <div className="flex-1">
                  <div className="text-sm font-medium">Devis {q.quoteNumber ?? q.reference ?? q.id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">
                    {(q.lines ?? q.items)?.length ?? 0} ligne(s) · validité {formatDate(q.validUntil)} · total{' '}
                    {formatPrice(q.totalAmount ?? 0)}
                  </div>
                </div>
                <Badge tone={TONES[q.status]}>{q.status}</Badge>
                {q.status === 'draft' && (
                  <Button size="sm" variant="outline" onClick={() => sendQ.mutate(q.id)}>Envoyer</Button>
                )}
                {q.status === 'sent' && (
                  <>
                    <Button size="sm" onClick={() => acceptQ.mutate(q.id)}>Accepter</Button>
                    <Button size="sm" variant="destructive" onClick={() => rejectQ.mutate(q.id)}>Refuser</Button>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau devis" className="max-w-2xl">
        <div className="space-y-3">
          <label className="block text-sm font-medium">Validité</label>
          <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />

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
                    quantity: l.quantity,
                    unitPrice: l.unitPrice || String(v?.price ?? ''),
                  };
                  setLines(next);
                }}
              >
                <option value="">Choisir une variante…</option>
                {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </Select>
              <Input
                type="number"
                min={1}
                placeholder="Qté"
                value={l.quantity}
                onChange={(e) => {
                  const next = [...lines];
                  next[i] = { ...l, quantity: e.target.value };
                  setLines(next);
                }}
              />
              <Input
                type="number"
                min={0}
                placeholder="Prix unit."
                value={l.unitPrice}
                onChange={(e) => {
                  const next = [...lines];
                  next[i] = { ...l, unitPrice: e.target.value };
                  setLines(next);
                }}
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLines([...lines, { variantId: '', label: '', quantity: '1', unitPrice: '' }])}
          >
            + Ajouter une ligne
          </Button>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button
              size="sm"
              loading={create.isPending}
              disabled={!lines.some((l) => l.variantId)}
              onClick={() => create.mutate()}
            >
              Créer le devis
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

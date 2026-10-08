// ── Promotions (vendeur) — chaque vendeur gère SES promotions ──
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardContent, EmptyState, Input, Modal, Select } from '@autoparts/ui';
import { promotionsApi, type Promotion } from '@autoparts/api';
import { formatDate, formatPrice } from '@autoparts/utils';

const TYPE_LABEL: Record<Promotion['type'], string> = {
  percentage: 'Remise %',
  fixed: 'Montant fixe',
  free_shipping: 'Livraison offerte',
  bogo: '2 pour 1',
};

export default function PromotionsVendeurPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'percentage' as Promotion['type'],
    discountValue: '',
    minOrderAmount: '',
    validFrom: '',
    validUntil: '',
  });

  const { data: promos = [] } = useQuery({
    queryKey: ['b2b', 'promotions'],
    queryFn: promotionsApi.mine,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['b2b', 'promotions'] });

  const create = useMutation({
    mutationFn: () =>
      promotionsApi.create({
        code: form.code,
        name: form.name,
        type: form.type,
        discountValue: Number(form.discountValue || 0),
        minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : undefined,
        validFrom: form.validFrom || undefined,
        validUntil: form.validUntil || undefined,
      }),
    onSuccess: () => {
      toast.success('Promotion créée — vos clients peuvent utiliser le code');
      setCreateOpen(false);
      setForm({ code: '', name: '', type: 'percentage', discountValue: '', minOrderAmount: '', validFrom: '', validUntil: '' });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: promotionsApi.toggle,
    onSuccess: (p) => {
      toast.success(p.isActive ? 'Promotion activée' : 'Promotion désactivée');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: promotionsApi.remove,
    onSuccess: () => { toast.success('Promotion supprimée'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeCount = (promos as Promotion[]).filter((p) => p.isActive).length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mes promotions</h1>
          <p className="text-sm text-muted-foreground">
            Créez vos codes promo : remise %, montant fixe, livraison offerte, 2 pour 1.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ Nouvelle promotion</Button>
      </header>

      {promos.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {activeCount} active(s) sur {promos.length} promotion(s).
        </p>
      )}

      {promos.length === 0 ? (
        <EmptyState
          title="Aucune promotion"
          description="Créez votre première promotion pour booster vos ventes (ex. -10 % sur les freins)."
        />
      ) : (
        <div className="space-y-2">
          {promos.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {p.code ? <span className="font-mono">{p.code}</span> : 'Promotion'}
                    {' — '}
                    {p.type === 'percentage' && `${Number(p.discountValue ?? 0)} %`}
                    {p.type === 'fixed' && `-${formatPrice(p.discountValue ?? 0)}`}
                    {p.type === 'free_shipping' && 'Livraison gratuite'}
                    {p.type === 'bogo' && '2 pour 1'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.name}
                    {p.minOrderAmount != null && Number(p.minOrderAmount) > 0 && <> · min. {formatPrice(p.minOrderAmount)}</>}
                    {p.validUntil && <> · expire le {formatDate(p.validUntil)}</>}
                    {p.maxUses != null && <> · {p.usesCount ?? 0}/{p.maxUses} utilisations</>}
                  </div>
                </div>
                <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>
                <Button size="sm" variant="outline" onClick={() => toggle.mutate(p.id)}>
                  {p.isActive ? 'Désactiver' : 'Activer'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id)} aria-label="Supprimer">
                  <Trash2 strokeWidth={1.5} className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvelle promotion" className="max-w-lg">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="Code (ex. FREIN10)"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
            <Input
              placeholder="Nom (ex. -10% freins)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Promotion['type'] })}>
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
            <Input
              type="number"
              placeholder={form.type === 'percentage' ? 'Valeur (%)' : 'Valeur (FCFA)'}
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
            />
          </div>
          <Input
            type="number"
            placeholder="Montant minimum du panier (optionnel)"
            value={form.minOrderAmount}
            onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Du</label>
              <Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Au</label>
              <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button
              size="sm"
              loading={create.isPending}
              disabled={form.code.length < 3 || form.name.length < 3 || !form.discountValue || !form.validFrom || !form.validUntil}
              onClick={() => create.mutate()}
            >
              Créer la promotion
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

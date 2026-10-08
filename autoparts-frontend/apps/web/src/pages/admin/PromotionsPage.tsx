// ── Promotions & codes promo (admin) ───────────────────────────
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, EmptyState, Input, Modal, Select } from '@autoparts/ui';
import { promotionsApi, type Promotion } from '@autoparts/api';
import { formatDate, formatPrice } from '@autoparts/utils';

export default function PromotionsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [testCode, setTestCode] = useState('');
  const [testAmount, setTestAmount] = useState('50000');
  const [testResult, setTestResult] = useState<unknown>(null);
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
    queryKey: ['admin', 'promotions'],
    queryFn: () => promotionsApi.list(false),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'promotions'] });

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
      toast.success('Promotion créée');
      setCreateOpen(false);
      setForm({ code: '', name: '', type: 'percentage', discountValue: '', minOrderAmount: '', validFrom: '', validUntil: '' });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => promotionsApi.toggle(id),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const validate = useMutation({
    mutationFn: () =>
      promotionsApi.validate({ code: testCode, orderAmount: Number(testAmount) || 0 }),
    onSuccess: setTestResult,
    onError: (e: Error) => { setTestResult(null); toast.error(e.message); },
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Promotions</h1>
          <p className="text-sm text-muted-foreground">
            Remises %, montants fixes, livraison gratuite — codes promo multi-usage.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ Nouvelle promotion</Button>
      </header>

      <Card className="max-w-xl">
        <CardContent className="space-y-2 py-4">
          <h2 className="text-sm font-semibold">Tester un code promo</h2>
          <div className="flex gap-2">
            <Input placeholder="CODE" value={testCode} onChange={(e) => setTestCode(e.target.value.toUpperCase())} />
            <Input className="w-40" type="number" placeholder="Panier" value={testAmount} onChange={(e) => setTestAmount(e.target.value)} />
            <Button size="sm" variant="outline" disabled={!testCode} loading={validate.isPending} onClick={() => validate.mutate()}>
              Valider
            </Button>
          </div>
          {testResult != null && (
            <pre className="max-h-32 overflow-auto rounded-input bg-muted/50 p-3 text-xs">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      {(promos as Promotion[]).length === 0 ? (
        <EmptyState title="Aucune promotion" description="Créez votre première promotion ou code promo." />
      ) : (
        <div className="space-y-2">
          {(promos as Promotion[]).map((p) => (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {p.code ? <span className="font-mono">{p.code}</span> : 'Promotion'}
                    {' — '}
                    {p.type === 'percentage' && `${p.discountValue ?? 0} %`}
                    {p.type === 'fixed' && `-${formatPrice(p.discountValue ?? 0)}`}
                    {p.type === 'free_shipping' && 'Livraison gratuite'}
                    {p.type === 'bogo' && '2 pour 1'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.minOrderAmount != null && <>Min {formatPrice(p.minOrderAmount)} · </>}
                    {p.validUntil && <>Expire le {formatDate(p.validUntil)} · </>}
                    scope : {p.scope ?? 'all'}
                  </div>
                </div>
                {p.isActive != null && (
                  <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>
                )}
                <Button size="sm" variant="outline" onClick={() => toggle.mutate(p.id)}>
                  {p.isActive ? 'Désactiver' : 'Activer'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvelle promotion">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="CODE" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Promotion['type'] })}>
            <option value="percentage">Pourcentage</option>
            <option value="fixed">Montant fixe</option>
            <option value="free_shipping">Livraison gratuite</option>
            <option value="bogo">2 pour 1</option>
          </Select>
          <Input placeholder="Nom de la promotion" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Valeur (% ou XAF)" type="number" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />
          <Input placeholder="Montant minimum (XAF)" type="number" value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} />
          <Input type="date" title="Début" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
          <Input type="date" title="Fin" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Annuler</Button>
          <Button size="sm" loading={create.isPending} disabled={!form.code || !form.name} onClick={() => create.mutate()}>
            Créer
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ── Organisations : KYB, vérification, crédit, tiers ──────────
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, Modal, Input, Select } from '@autoparts/ui';
import { orgsApi, geoApi } from '@autoparts/api';
import { DataTable, type Column } from '@autoparts/ui';
import { formatPrice } from '@autoparts/utils';
import type { Organization, OrgType, OrgDocument } from '@autoparts/types';

const DOC_LABELS: Record<string, string> = {
  rccm: 'RCCM', patente: 'Patente', statuts: 'Statuts', id_card: 'CNI',
};

/** File d'attente KYB : chaque document déposé par un vendeur, avec
 *  approbation (org vérifiée) ou refus motivé. */
function KybReviewPanel({ onDecided }: { onDecided: () => void }) {
  const qc = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<OrgDocument | null>(null);
  const [reason, setReason] = useState('');

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['admin', 'kyb', 'pending'],
    queryFn: orgsApi.kybPending,
  });

  const decide = useMutation({
    mutationFn: ({ id, decision, reason: r }: { id: string; decision: 'approve' | 'reject'; reason?: string }) =>
      orgsApi.kybDecide(id, decision, r),
    onSuccess: (_d, v) => {
      toast.success(v.decision === 'approve'
        ? 'Document approuvé — organisation vérifiée'
        : 'Document refusé — motif transmis au vendeur');
      setRejectTarget(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['admin', 'kyb', 'pending'] });
      onDecided();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <Card><CardContent className="py-4 text-sm text-muted-foreground">Chargement de la file KYB…</CardContent></Card>;
  }
  if (pending.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Documents KYB en attente</h2>
          <Badge tone="accent">{pending.length}</Badge>
        </div>
        <div className="space-y-2">
          {(pending as OrgDocument[]).map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-input border border-border px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {d.org?.name ?? 'Organisation'} — {DOC_LABELS[d.type] ?? d.type}
                </div>
                <div className="text-xs text-muted-foreground">{d.originalName ?? 'document'}</div>
              </div>
              <a
                href={`${import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3000'}/api/v1/organizations/kyb/${d.id}/file`}
                target="_blank"
                rel="noreferrer"
                download
                onClick={async (e) => {
                  // le fichier exige le token Bearer : téléchargement authentifié
                  e.preventDefault();
                  try {
                    const { getBlob } = await import('@autoparts/api');
                    const blob = await getBlob(`/organizations/kyb/${d.id}/file`);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = d.originalName ?? `kyb-${d.type}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    toast.error((err as Error).message ?? 'Téléchargement impossible');
                  }
                }}
                className="text-sm text-primary hover:underline"
              >
                Télécharger
              </a>
              <Button size="sm" onClick={() => decide.mutate({ id: d.id, decision: 'approve' })} loading={decide.isPending}>
                Approuver
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setRejectTarget(d)}>
                Refuser
              </Button>
            </div>
          ))}
        </div>

        <Modal open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} title="Refuser le document">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Le motif est transmis par email au vendeur ({rejectTarget?.org?.name}).
            </p>
            <Input
              placeholder="Motif (ex. : scan illisible, document expiré…)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRejectTarget(null)}>Annuler</Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={reason.trim().length < 5}
                onClick={() => decide.mutate({ id: rejectTarget!.id, decision: 'reject', reason })}
              >
                Confirmer le refus
              </Button>
            </div>
          </div>
        </Modal>
      </CardContent>
    </Card>
  );
}

const ORG_TYPES: Array<{ value: OrgType; label: string }> = [
  { value: 'importer', label: 'Importateur' },
  { value: 'wholesaler', label: 'Grossiste' },
  { value: 'retailer', label: 'Détaillant' },
  { value: 'garage', label: 'Garage' },
];

export default function OrganisationsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [creditTarget, setCreditTarget] = useState<Organization | null>(null);
  const [creditLimit, setCreditLimit] = useState('');
  const [geoOpen, setGeoOpen] = useState(false);
  const [geoForm, setGeoForm] = useState({ lat: '', lng: '', name: '' });
  const [form, setForm] = useState({ name: '', orgType: 'retailer' as OrgType, email: '', phone: '' });
  // Règles org_type — toggle « peut vendre » (confirmation obligatoire)
  const [canSellTarget, setCanSellTarget] = useState<{ org: Organization; next: boolean } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'orgs', page],
    queryFn: () => orgsApi.list(page, 10),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'orgs'] });

  const create = useMutation({
    mutationFn: () => orgsApi.create(form),
    onSuccess: () => {
      toast.success('Organisation créée');
      setCreateOpen(false);
      setForm({ name: '', orgType: 'retailer', email: '', phone: '' });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: (id: string) => orgsApi.verify(id),
    onSuccess: () => { toast.success('Organisation vérifiée (KYB)'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setCredit = useMutation({
    mutationFn: () => orgsApi.setCreditLimit(creditTarget!.id, Number(creditLimit)),
    onSuccess: () => {
      toast.success('Limite de crédit mise à jour');
      setCreditTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Règles org_type — activation/désactivation de la capacité de vendre
  const setCanSell = useMutation({
    mutationFn: () => orgsApi.setCanSell(canSellTarget!.org.id, canSellTarget!.next),
    onSuccess: () => {
      toast.success(
        canSellTarget!.next
          ? 'Compte activé vendeur — ce compte pourra lister des produits à la vente'
          : 'Capacité de vente désactivée',
      );
      setCanSellTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLocation = useMutation({
    mutationFn: () =>
      geoApi.setLocation({ lat: Number(geoForm.lat), lng: Number(geoForm.lng), name: geoForm.name || undefined }),
    onSuccess: () => {
      toast.success('Localisation enregistrée — visible dans « vendeurs proches »');
      setGeoOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<Organization>[] = [
    {
      key: 'name',
      header: 'Organisation',
      render: (o) => (
        <div>
          <div className="font-medium">{o.name}</div>
          <div className="text-xs text-muted-foreground">{o.email ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'orgType',
      header: 'Type',
      render: (o) => (
        <div>
          <div>{ORG_TYPES.find((t) => t.value === o.orgType)?.label ?? o.orgType}</div>
          {/* Règles org_type : rôle vendeur/acheteur (can_sell) */}
          {o.canSell != null && (
            <Badge tone={o.canSell ? 'primary' : 'neutral'} className="mt-1">
              {o.canSell ? 'Vendeur' : 'Acheteur'}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'isVerified',
      header: 'KYB / Badge',
      render: (o) => (
        <div className="flex items-center gap-2">
          {o.isVerified ? <Badge tone="success">Vendeur vérifié</Badge> : <Badge tone="accent">En attente</Badge>}
          {o.performanceScore != null && Number(o.performanceScore) > 0 && (
            <Badge tone="primary">Score {Number(o.performanceScore).toFixed(0)}/100</Badge>
          )}
        </div>
      ),
    },
    { key: 'creditLimit', header: 'Crédit', render: (o) => formatPrice(o.creditLimit) },
    {
      key: 'actions',
      header: '',
      render: (o) => (
        <div className="flex gap-2">
          {!o.isVerified && (
            <Button
              size="sm"
              variant="outline"
              onClick={((e: MouseEvent) => { e.stopPropagation(); verify.mutate(o.id); }) as never}
            >
              Vérifier
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={((e: MouseEvent) => { e.stopPropagation(); setCreditTarget(o); setCreditLimit(String(o.creditLimit ?? 0)); }) as never}
          >
            Crédit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={((e: MouseEvent) => { e.stopPropagation(); setCanSellTarget({ org: o, next: !(o.canSell === true) }); }) as never}
          >
            {o.canSell ? 'Désactiver vente' : 'Activer vente'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={((e: MouseEvent) => { e.stopPropagation(); setGeoOpen(true); setGeoForm({ lat: '', lng: '', name: o.name }); }) as never}
          >
            Localiser
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Organisations</h1>
          <p className="text-sm text-muted-foreground">Vérification KYB, limites de crédit, tiers B2B.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ Nouvelle organisation</Button>
      </header>

      {/* File KYB : documents déposés par les vendeurs, en attente de décision */}
      <KybReviewPanel onDecided={invalidate} />

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(o) => o.id}
        loading={isLoading}
        page={page}
        total={data?.pagination?.total}
        limit={10}
        onPageChange={setPage}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvelle organisation">
        <div className="space-y-3">
          <Input placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select value={form.orgType} onChange={(e) => setForm({ ...form, orgType: e.target.value as OrgType })}>
            {ORG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button size="sm" loading={create.isPending} disabled={!form.name} onClick={() => create.mutate()}>
              Créer
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(creditTarget)} onClose={() => setCreditTarget(null)} title={`Limite de crédit — ${creditTarget?.name ?? ''}`}>
        <div className="space-y-3">
          <Input
            type="number"
            min={0}
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Les commandes dépassant ce montant seront bloquées ou soumisent à approbation.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCreditTarget(null)}>Annuler</Button>
            <Button size="sm" loading={setCredit.isPending} onClick={() => setCredit.mutate()}>Enregistrer</Button>
          </div>
        </div>
      </Modal>

      {/* Règles org_type — confirmation avant activation de la vente */}
      <Modal
        open={Boolean(canSellTarget)}
        onClose={() => setCanSellTarget(null)}
        title={canSellTarget?.next ? `Activer la vente — ${canSellTarget.org.name}` : `Désactiver la vente — ${canSellTarget?.org.name ?? ''}`}
      >
        <div className="space-y-3">
          <p className="text-sm">
            {canSellTarget?.next
              ? "Ce compte pourra lister des produits à la vente sur la marketplace (accès à la gestion produits et au stock vendeur)."
              : "Ce compte ne pourra plus lister de produits à la vente. Ses produits existants resteront en ligne mais ne seront plus modifiables par l'organisation."}
          </p>
          <p className="text-xs text-muted-foreground">
            Le type d'organisation ({ORG_TYPES.find((t) => t.value === canSellTarget?.org.orgType)?.label ?? canSellTarget?.org.orgType})
            et le tier de prix restent inchangés : ce toggle gère uniquement la capacité de vendre.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCanSellTarget(null)}>Annuler</Button>
            <Button
              size="sm"
              variant={canSellTarget?.next ? 'default' : 'outline'}
              loading={setCanSell.isPending}
              onClick={() => setCanSell.mutate()}
            >
              Confirmer
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={geoOpen} onClose={() => setGeoOpen(false)} title={`Localiser — ${geoForm.name}`}>
        <div className="space-y-3">
          <Input type="number" step="any" placeholder="Latitude (ex. 4.05)" value={geoForm.lat} onChange={(e) => setGeoForm({ ...geoForm, lat: e.target.value })} />
          <Input type="number" step="any" placeholder="Longitude (ex. 9.7)" value={geoForm.lng} onChange={(e) => setGeoForm({ ...geoForm, lng: e.target.value })} />
          <p className="text-xs text-muted-foreground">Rend l'organisation visible dans la recherche « vendeurs proches ».</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setGeoOpen(false)}>Annuler</Button>
            <Button size="sm" loading={setLocation.isPending} disabled={!geoForm.lat || !geoForm.lng} onClick={() => setLocation.mutate()}>Enregistrer</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

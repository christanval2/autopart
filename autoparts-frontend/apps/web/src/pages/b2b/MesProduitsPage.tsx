// ── Mes produits (vendeur) : liste + création + variantes + images ──
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, Input, Modal, Select, Skeleton, Textarea, Checkbox, EmptyState } from '@autoparts/ui';
import { OcrPrefillButton } from '@/components/search/OcrPrefillButton';
import { productsApi, productsAdminApi, catalogApi, uploadsApi, mediaUrl } from '@autoparts/api';
import { formatPrice } from '@autoparts/utils';
import { DataTable, type Column } from '@autoparts/ui';
import type { Product, ProductCondition } from '@autoparts/types';
import { useAuthStore } from '@/store/auth.store';

const ORG_TYPE_LABELS: Record<string, string> = {
  importer: 'Importateur',
  wholesaler: 'Grossiste',
  retailer: 'Détaillant',
  garage: 'Garage',
};

// ── Modale « + Variante » ──────────────────────────────────────
function VariantModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const qc = useQueryClient();
  const [variantSku, setVariantSku] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [priceOverride, setPriceOverride] = useState('');
  const [attrs, setAttrs] = useState<Array<{ key: string; value: string }>>([]);

  // Détail du produit (variantes existantes)
  const { data: detail, isLoading } = useQuery({
    queryKey: ['products', product.id],
    queryFn: () => productsApi.byId(product.id),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['products', product.id] });
    void qc.invalidateQueries({ queryKey: ['b2b', 'products'] });
  };

  const create = useMutation({
    mutationFn: () => {
      const attributes: Record<string, string> = {};
      attrs.forEach((a) => {
        if (a.key.trim()) attributes[a.key.trim()] = a.value.trim();
      });
      return productsAdminApi.addVariant(product.id, {
        variantSku: variantSku.trim(),
        attributes,
        costPrice: Number(costPrice),
        priceOverride: priceOverride ? Number(priceOverride) : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Variante créée');
      setVariantSku('');
      setCostPrice('');
      setPriceOverride('');
      setAttrs([]);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const variants = detail?.variants ?? [];

  return (
    <Modal open onClose={onClose} title={`Variantes — ${product.name}`} className="max-w-xl">
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Variantes existantes */}
          <div>
            <h4 className="mb-2 text-sm font-semibold">Variantes existantes</h4>
            {variants.length === 0 ? (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Aucune variante — le produit n'est pas commandable tant qu'il n'en a pas une.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {variants.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{v.variantSku}</div>
                      <div className="text-xs text-muted-foreground">
                        {Object.entries(v.attributes ?? {}).map(([k, val]) => `${k}: ${val}`).join(' · ') || 'Sans attributs'}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      {v.priceOverride != null && (
                        <div className="font-semibold text-primary">{formatPrice(v.priceOverride)}</div>
                      )}
                      {v.costPrice != null && (
                        <div className="text-muted-foreground">coût {formatPrice(v.costPrice)}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Formulaire nouvelle variante */}
          <div className="space-y-3 border-t border-border pt-4">
            <h4 className="text-sm font-semibold">Nouvelle variante</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="SKU variante (unique)"
                value={variantSku}
                onChange={(e) => setVariantSku(e.target.value)}
              />
              <Input
                placeholder="Prix de revient (XAF) *"
                type="number"
                min={0}
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
              />
              <Input
                placeholder="Prix de vente override (optionnel)"
                type="number"
                min={0}
                value={priceOverride}
                onChange={(e) => setPriceOverride(e.target.value)}
              />
            </div>

            {/* Attributs libres (position, diamètre…) */}
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Attributs (ex. position : avant)
              </div>
              {attrs.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="Clé"
                    value={a.key}
                    onChange={(e) => {
                      const next = [...attrs];
                      next[i] = { ...a, key: e.target.value };
                      setAttrs(next);
                    }}
                  />
                  <Input
                    placeholder="Valeur"
                    value={a.value}
                    onChange={(e) => {
                      const next = [...attrs];
                      next[i] = { ...a, value: e.target.value };
                      setAttrs(next);
                    }}
                  />
                  <Button variant="ghost" size="sm" onClick={() => setAttrs(attrs.filter((_, j) => j !== i))}>
                    ✕
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setAttrs([...attrs, { key: '', value: '' }])}>
                + Attribut
              </Button>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
              <Button
                size="sm"
                loading={create.isPending}
                disabled={!variantSku.trim() || !costPrice}
                onClick={() => create.mutate()}
              >
                Créer la variante
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Modale Images ──────────────────────────────────────────────
function ImagesModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['products', product.id],
    queryFn: () => productsApi.byId(product.id),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['products', product.id] });
    void qc.invalidateQueries({ queryKey: ['b2b', 'products'] });
  };

  const upload = useMutation({
    mutationFn: () => uploadsApi.uploadProductImage(product.id, file!, isPrimary),
    onSuccess: () => {
      toast.success('Image uploadée');
      setFile(null);
      setIsPrimary(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (imageId: string) => uploadsApi.deleteImage(imageId),
    onSuccess: () => {
      toast.success('Image supprimée');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const images = detail?.images ?? [];

  return (
    <Modal open onClose={onClose} title={`Images — ${product.name}`} className="max-w-lg">
      {isLoading ? (
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="aspect-square rounded-md" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {images.length === 0 ? (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Aucune image — la première image envoyée sert d'image principale aux listings.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {images.map((img) => (
                <div key={img.id} className="group relative overflow-hidden rounded-md border border-border">
                  <img src={mediaUrl(img.sizes?.thumb ?? img.thumbUrl ?? img.url)} alt="" className="aspect-square w-full object-cover" />
                  {img.isPrimary && (
                    <Badge tone="default" className="absolute left-1 top-1">Principale</Badge>
                  )}
                  <button
                    className="absolute right-1 top-1 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => remove.mutate(img.id)}
                  >
                    Suppr.
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t border-border pt-4">
            <input
              type="file"
              accept="image/*"
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Checkbox
              id="is-primary"
              label="Définir comme image principale"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
              <Button
                size="sm"
                loading={upload.isPending}
                disabled={!file}
                onClick={() => upload.mutate()}
              >
                Uploader
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Page ───────────────────────────────────────────────────────
export default function MesProduitsPage() {
  const qc = useQueryClient();
  const org = useAuthStore((s) => s.user?.org);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [variantTarget, setVariantTarget] = useState<Product | null>(null);
  const [imageTarget, setImageTarget] = useState<Product | null>(null);
  // Règles org_type — édition produit par produit du MOQ et du listing public
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ minOrderQty: '', publicListing: false });
  const [form, setForm] = useState({
    name: '',
    sku: '',
    oemReference: '',
    basePrice: '',
    condition: 'new' as ProductCondition,
    categoryId: '',
    brandId: '',
    description: '',
    minOrderQty: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['b2b', 'products', 'mine', page],
    queryFn: () => productsApi.list({ page, limit: 10, mine: true }),
    placeholderData: keepPreviousData,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: catalogApi.categories,
  });
  const { data: brands = [] } = useQuery({
    queryKey: ['catalog', 'brands'],
    queryFn: catalogApi.brands,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['b2b', 'products'] });

  const create = useMutation({
    mutationFn: () =>
      productsAdminApi.create({
        name: form.name,
        sku: form.sku,
        oemReference: form.oemReference || undefined,
        basePrice: Number(form.basePrice),
        condition: form.condition,
        categoryId: form.categoryId,
        brandId: form.brandId,
        description: form.description || undefined,
        // Règles org_type : vide = MOQ par défaut selon le org_type du vendeur
        minOrderQty: form.minOrderQty ? Number(form.minOrderQty) : undefined,
      }),
    onSuccess: (created) => {
      toast.success('Produit créé — ajoutez une variante pour le rendre commandable');
      setCreateOpen(false);
      setForm({ name: '', sku: '', oemReference: '', basePrice: '', condition: 'new', categoryId: '', brandId: '', description: '', minOrderQty: '' });
      invalidate();
      setVariantTarget(created);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => productsAdminApi.remove(id),
    onSuccess: () => { toast.success('Produit supprimé'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Règles org_type — MOQ (vide = défaut selon le org_type du vendeur)
  // et visibilité catalogue public, modifiables produit par produit.
  const updateMoq = useMutation({
    mutationFn: () =>
      productsAdminApi.update(editTarget!.id, {
        minOrderQty: editForm.minOrderQty ? Number(editForm.minOrderQty) : null,
        publicListing: editForm.publicListing,
      }),
    onSuccess: () => {
      toast.success('Produit mis à jour');
      setEditTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importCsv = useMutation({
    mutationFn: (file: File) => productsAdminApi.bulkImport(file),
    onSuccess: () => {
      toast.success('Import lancé — rapport détaillé à la fin du traitement');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Produit',
      render: (p) => (
        <div>
          <div className="font-medium">{p.name}</div>
          <div className="text-xs text-muted-foreground">
            SKU {p.sku}
            {p.oemReference ? ` · OEM ${p.oemReference}` : ''}
            {p.variants ? ` · ${p.variants.length} variante(s)` : ''}
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Catégorie', render: (p) => p.category?.name ?? '—' },
    { key: 'basePrice', header: 'Prix', render: (p) => formatPrice(p.basePrice) },
    {
      key: 'moq',
      header: 'MOQ',
      render: (p) => (p.minOrderQty != null ? (
        <Badge tone="neutral">Min. {p.minOrderQty}</Badge>
      ) : <span className="text-xs text-muted-foreground">—</span>),
    },
    {
      key: 'isActive',
      header: 'Statut',
      render: (p) => (
        <div className="flex items-center gap-1">
          {p.isActive ? <Badge tone="success">Actif</Badge> : <Badge tone="destructive">Inactif</Badge>}
          {p.publicListing && <Badge tone="primary">Public</Badge>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setVariantTarget(p); }}
          >
            Variantes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setImageTarget(p); }}
          >
            Images
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setEditTarget(p); setEditForm({ minOrderQty: p.minOrderQty != null ? String(p.minOrderQty) : '', publicListing: p.publicListing === true }); }}
          >
            MOQ
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              if (window.confirm(`Supprimer « ${p.name} » ?`)) remove.mutate(p.id);
            }}
          >
            Supprimer
          </Button>
        </div>
      ),
    },
  ];

  // Règles org_type — un retailer/garage sans can_sell n'a pas accès à la
  // vente : état explicite plutôt que masquer le menu (évite la confusion
  // « la fonctionnalité n'existe pas »). Un admin peut activer le compte
  // depuis /admin/organisations. (Placé après les hooks — règle de React.)
  if (org && !org.canSell) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-card border border-border bg-card p-8 text-center">
          <div className="text-4xl">🔒</div>
          <h1 className="mt-3 text-xl font-bold">Accès non disponible pour votre type d'organisation</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Votre compte ({ORG_TYPE_LABELS[org.orgType] ?? org.orgType}) est configuré en tant
            qu'acheteur : il ne peut pas lister de produits à la vente sur la marketplace.
            Un administrateur peut activer la vente pour ce compte si vous revendez également des pièces.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Pour l'activation, contactez l'équipe plateforme (référence : organisation « {org.name} »).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mes produits</h1>
          <p className="text-sm text-muted-foreground">
            Créez le produit puis sa variante : c'est la variante qui porte le stock et le panier.
          </p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv.mutate(f);
              }}
            />
            <span className="inline-flex h-8 items-center rounded-md border border-input px-3 text-xs font-medium hover:bg-muted">
              Importer CSV
            </span>
          </label>
          <Button size="sm" onClick={() => setCreateOpen(true)}>+ Nouveau produit</Button>
        </div>
      </header>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(p) => p.id}
        loading={isLoading}
        page={page}
        total={data?.pagination?.total}
        limit={10}
        onPageChange={setPage}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau produit" className="max-w-xl">
        <div className="grid gap-3 sm:grid-cols-2">
          {/* OCR : photographier l'étiquette → remplir la référence OEM */}
          <div className="sm:col-span-2">
            <OcrPrefillButton onReference={(ref) => setForm((f) => ({ ...f, oemReference: ref }))} />
          </div>
          <Input placeholder="Nom du produit" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <Input placeholder="Référence OEM (optionnel)" value={form.oemReference} onChange={(e) => setForm({ ...form, oemReference: e.target.value })} />
          <Input placeholder="Prix (XAF)" type="number" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} />
          <Input
            placeholder="Quantité minimum — vide = défaut (50 importateur / 5 grossiste)"
            type="number"
            min={1}
            value={form.minOrderQty}
            onChange={(e) => setForm({ ...form, minOrderQty: e.target.value })}
          />
          <Select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value as ProductCondition })}>
            <option value="new">Neuf</option>
            <option value="genuine_used">Occasion certifiée</option>
            <option value="reconditioned">Reconditionné</option>
          </Select>
          <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Catégorie…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
            <option value="">Marque…</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <div className="sm:col-span-2">
            <Textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Annuler</Button>
          <Button
            size="sm"
            loading={create.isPending}
            disabled={!form.name || !form.sku || !form.basePrice || !form.categoryId || !form.brandId}
            onClick={() => create.mutate()}
          >
            Créer le produit
          </Button>
        </div>
      </Modal>

      {/* Règles org_type — édition MOQ + listing public (produit par produit) */}
      <Modal open={Boolean(editTarget)} onClose={() => setEditTarget(null)} title={`Commande minimum — ${editTarget?.name ?? ''}`} className="max-w-md">
        <div className="space-y-3">
          <Input
            placeholder="Quantité minimum (vide = pas de MOQ)"
            type="number"
            min={1}
            value={editForm.minOrderQty}
            onChange={(e) => setEditForm({ ...editForm, minOrderQty: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Défaut selon votre type d'organisation : 50 (importateur — palette), 5 (grossiste — carton), 1 (autre). Le panier refusera toute commande en dessous.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={editForm.publicListing}
              onChange={(e) => setEditForm({ ...editForm, publicListing: e.target.checked })}
            />
            Afficher sur le catalogue public (au tier « détail »)
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditTarget(null)}>Annuler</Button>
            <Button size="sm" loading={updateMoq.isPending} onClick={() => updateMoq.mutate()}>Enregistrer</Button>
          </div>
        </div>
      </Modal>

      {variantTarget && <VariantModal product={variantTarget} onClose={() => setVariantTarget(null)} />}
      {imageTarget && <ImagesModal product={imageTarget} onClose={() => setImageTarget(null)} />}

      {data?.items.length === 0 && !isLoading && (
        <EmptyState
          title="Aucun produit"
          description="Créez votre premier produit ou importez un catalogue CSV."
        />
      )}
    </div>
  );
}

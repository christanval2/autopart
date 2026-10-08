// ── Modération des produits (admin) ────────────────────────────
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, Modal } from '@autoparts/ui';
import { productsApi, productsAdminApi, mediaUrl } from '@autoparts/api';
import { formatPrice } from '@autoparts/utils';
import { DataTable, type Column } from '@autoparts/ui';
import type { Product } from '@autoparts/types';

export default function ProduitsModerationPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Product | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'products', page],
    queryFn: () => productsApi.list({ page, limit: 10 }),
    placeholderData: keepPreviousData,
  });

  const toggleActive = useMutation({
    mutationFn: (p: Product) => productsAdminApi.update(p.id, { isActive: !p.isActive }),
    onSuccess: () => {
      toast.success('Statut du produit mis à jour');
      void qc.invalidateQueries({ queryKey: ['admin', 'products'] });
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
          <div className="text-xs text-muted-foreground">SKU {p.sku}{p.oemReference ? ` · OEM ${p.oemReference}` : ''}</div>
        </div>
      ),
    },
    { key: 'brand', header: 'Marque', render: (p) => p.brand?.name ?? '—' },
    { key: 'category', header: 'Catégorie', render: (p) => p.category?.name ?? '—' },
    { key: 'basePrice', header: 'Prix', render: (p) => formatPrice(p.basePrice) },
    {
      key: 'isActive',
      header: 'Statut',
      render: (p) => (p.isActive ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Désactivé</Badge>),
    },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={((e: MouseEvent) => { e.stopPropagation(); setDetail(p); }) as never}>
            Détails
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={((e: MouseEvent) => { e.stopPropagation(); toggleActive.mutate(p); }) as never}
          >
            {p.isActive ? 'Désactiver' : 'Activer'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Modération produits</h1>
        <p className="text-sm text-muted-foreground">Supervision du catalogue : activation, désactivation, conformité.</p>
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
        onRowClick={(row) => setDetail(row)}
      />

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.name}>
        {detail && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{detail.description ?? 'Aucune description.'}</p>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Condition : </span>{detail.condition}</div>
              <div><span className="text-muted-foreground">Prix : </span>{formatPrice(detail.basePrice)}</div>
              <div><span className="text-muted-foreground">Variantes : </span>{detail.variants?.length ?? 0}</div>
              <div><span className="text-muted-foreground">Compatibilités : </span>{detail.compatibilities?.length ?? 0}</div>
            </div>
            {detail.images && detail.images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {detail.images.map((img) => (
                  <img key={img.id} src={mediaUrl(img.sizes?.thumb ?? img.thumbUrl ?? img.url)} className="h-20 w-20 rounded object-cover" alt="" />
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

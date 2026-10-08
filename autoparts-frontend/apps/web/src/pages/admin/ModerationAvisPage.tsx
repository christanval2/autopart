// ── Modération des avis (admin) ────────────────────────────────
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, RatingStars, Select } from '@autoparts/ui';
import { reviewsApi } from '@autoparts/api';
import { formatDateTime } from '@autoparts/utils';
import { DataTable, type Column } from '@autoparts/ui';
import type { Review } from '@autoparts/types';

export default function ModerationAvisPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  // 'visible' = publiés, 'pending', 'rejected', 'all' — filtre appliqué par le serveur
  const [status, setStatus] = useState<'visible' | 'pending' | 'rejected' | 'all'>('visible');

  const { data: all, isLoading } = useQuery({
    queryKey: ['admin', 'reviews-all', page, status],
    queryFn: () => reviewsApi.list({ page, limit: 10, status }),
    placeholderData: keepPreviousData,
  });

  const rows = all?.items ?? [];

  const moderate = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'approved' | 'rejected' }) =>
      reviewsApi.moderate(id, next),
    onSuccess: () => {
      toast.success('Avis modéré');
      void qc.invalidateQueries({ queryKey: ['admin', 'reviews-all'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<Review>[] = [
    {
      key: 'rating',
      header: 'Avis',
      render: (r) => (
        <div className="max-w-md">
          <RatingStars value={r.rating} size={13} />
          {r.comment && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.comment}</div>}
        </div>
      ),
    },
    { key: 'user', header: 'Client', render: (r) => (r.user ? `${r.user.firstName} ${r.user.lastName}` : '—') },
    { key: 'createdAt', header: 'Date', render: (r) => formatDateTime(r.createdAt) },
    {
      key: 'status',
      header: 'Statut',
      render: (r) =>
        r.status === 'approved' ? (
          <Badge tone="success">Publié</Badge>
        ) : r.status === 'pending' ? (
          <Badge tone="accent">En attente</Badge>
        ) : (
          <Badge tone="danger">Rejeté</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex gap-2">
          {r.status !== 'approved' && (
            <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: r.id, next: 'approved' })}>
              Publier
            </Button>
          )}
          {r.status !== 'rejected' && (
            <Button size="sm" variant="destructive" onClick={() => moderate.mutate({ id: r.id, next: 'rejected' })}>
              Rejeter
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Modération des avis</h1>
          <p className="text-sm text-muted-foreground">
            Vérification achat confirmé automatique — suppression avec motif possible.
          </p>
        </div>
        <Select
          className="w-44"
          value={status}
          onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}
        >
          <option value="visible">Publiés</option>
          <option value="pending">En attente</option>
          <option value="rejected">Rejetés</option>
          <option value="all">Tous</option>
        </Select>
      </header>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyLabel="Aucun avis"
        page={page}
        total={all?.pagination?.total}
        limit={10}
        onPageChange={setPage}
      />
    </div>
  );
}

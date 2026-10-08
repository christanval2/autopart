// ── Gestion des litiges (arbitrage admin) ──────────────────────
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, Select, Textarea, Modal } from '@autoparts/ui';
import { disputesApi } from '@autoparts/api';
import { formatDateTime } from '@autoparts/utils';
import { DataTable, type Column } from '@autoparts/ui';
import type { Dispute, DisputeStatus } from '@autoparts/types';

const STATUS_TONES: Record<DisputeStatus, 'accent' | 'info' | 'success' | 'danger' | 'neutral'> = {
  open: 'accent',
  under_review: 'info',
  resolved_buyer: 'success',
  resolved_seller: 'success',
  closed: 'neutral',
};

export default function LitigesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Dispute | null>(null);
  const [newStatus, setNewStatus] = useState<DisputeStatus>('under_review');
  const [resolution, setResolution] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'disputes', page],
    queryFn: () => disputesApi.list(page, 10),
    placeholderData: keepPreviousData,
  });

  const update = useMutation({
    mutationFn: () => disputesApi.update(detail!.id, { status: newStatus, resolution: resolution || undefined }),
    onSuccess: () => {
      toast.success('Litige mis à jour');
      setDetail(null);
      setResolution('');
      void qc.invalidateQueries({ queryKey: ['admin', 'disputes'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<Dispute>[] = [
    { key: 'orderId', header: 'Commande', render: (d) => <span className="font-mono text-xs">{d.orderId?.slice(0, 8)}…</span> },
    { key: 'reason', header: 'Motif', render: (d) => <span className="line-clamp-1">{d.reason}</span> },
    { key: 'createdAt', header: 'Ouvert le', render: (d) => formatDateTime(d.createdAt) },
    {
      key: 'status',
      header: 'Statut',
      render: (d) => <Badge tone={STATUS_TONES[d.status]}>{d.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (d) => (
        <Button
          size="sm"
          variant="outline"
          onClick={((e: MouseEvent) => { e.stopPropagation(); setDetail(d); setNewStatus(d.status); }) as never}
        >
          Arbitrer
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Litiges</h1>
        <p className="text-sm text-muted-foreground">
          Résolution acheteur/vendeur — SLA cible : 5 jours ouvrés.
        </p>
      </header>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(d) => d.id}
        loading={isLoading}
        emptyLabel="Aucun litige"
        page={page}
        total={data?.pagination?.total}
        limit={10}
        onPageChange={setPage}
        onRowClick={(row) => setDetail(row)}
      />

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Arbitrage du litige">
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="rounded-input bg-muted/50 p-3">
              <div className="text-xs uppercase text-muted-foreground">Motif</div>
              <div>{detail.reason}</div>
              {detail.description && (
                <div className="mt-2 text-xs uppercase text-muted-foreground">Description</div>
              )}
              {detail.description && <div>{detail.description}</div>}
            </div>
            <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value as DisputeStatus)}>
              <option value="under_review">En cours d'examen</option>
              <option value="resolved_buyer">Résolu en faveur de l'acheteur</option>
              <option value="resolved_seller">Résolu en faveur du vendeur</option>
              <option value="closed">Clos</option>
            </Select>
            <Textarea
              placeholder="Décision / résolution (communiquée aux parties)"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>Annuler</Button>
              <Button size="sm" loading={update.isPending} onClick={() => update.mutate()}>
                Enregistrer la décision
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

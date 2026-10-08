// ── Journal d'audit (super_admin) ──────────────────────────────
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge } from '@autoparts/ui';
import { auditApi } from '@autoparts/api';
import { formatDateTime } from '@autoparts/utils';
import { DataTable, type Column } from '@autoparts/ui';
import type { AuditLogEntry } from '@autoparts/types';

export default function JournalAuditPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit', page],
    queryFn: () => auditApi.list(page, 10),
    placeholderData: keepPreviousData,
  });

  const columns: Column<AuditLogEntry>[] = [
    { key: 'createdAt', header: 'Horodatage', render: (e) => formatDateTime(e.createdAt) },
    {
      key: 'action',
      header: 'Action',
      render: (e) => <Badge tone="primary">{e.action}</Badge>,
    },
    {
      key: 'entity',
      header: 'Entité',
      render: (e) =>
        e.entity ? (
          <span className="text-xs">
            {e.entity}
            {e.entityId ? <span className="ml-1 font-mono text-muted-foreground">{e.entityId.slice(0, 8)}…</span> : null}
          </span>
        ) : (
          '—'
        ),
    },
    { key: 'userId', header: 'Utilisateur', render: (e) => <span className="font-mono text-xs">{e.userId?.slice(0, 8) ?? '—'}…</span> },
    { key: 'ip', header: 'IP', render: (e) => e.ip ?? '—' },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Journal d'audit</h1>
        <p className="text-sm text-muted-foreground">
          Traçabilité des actions sensibles — rétention 90 jours, export RGPD sur demande.
        </p>
      </header>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(e) => e.id}
        loading={isLoading}
        emptyLabel="Aucune entrée"
        page={page}
        total={data?.pagination?.total}
        limit={10}
        onPageChange={setPage}
      />
    </div>
  );
}

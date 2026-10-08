// ── Gestion des utilisateurs (super_admin) ─────────────────────
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, Badge, Modal, Checkbox } from '@autoparts/ui';
import { adminUsersApi, usersAdminApi } from '@autoparts/api';
import { formatDate } from '@autoparts/utils';
import { DataTable, type Column } from '@autoparts/ui';
import type { User, UserRole } from '@autoparts/types';

const ALL_ROLES: UserRole[] = ['buyer', 'seller', 'org_admin', 'logistics', 'super_admin'];

export default function UtilisateursPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<User | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin', 'users', page],
    queryFn: () => adminUsersApi.list(page, 10),
    placeholderData: keepPreviousData,
  });

  const saveRoles = useMutation({
    mutationFn: () => usersAdminApi.updateRoles(editing!.id, roles),
    onSuccess: () => {
      toast.success('Rôles mis à jour');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<User>[] = [
    {
      key: 'email',
      header: 'Utilisateur',
      render: (u) => (
        <div>
          <div className="font-medium">{u.firstName} {u.lastName}</div>
          <div className="text-xs text-muted-foreground">{u.email}</div>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Rôles',
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {(u.roles ?? []).map((r) => <Badge key={r} tone="primary">{r}</Badge>)}
        </div>
      ),
    },
    {
      key: 'isVerified',
      header: 'Vérifié',
      render: (u) => (u.isVerified ? <Badge tone="success">Oui</Badge> : <Badge tone="accent">Non</Badge>),
    },
    { key: 'lastLoginAt', header: 'Dernière connexion', render: (u) => formatDate(u.lastLoginAt) },
    {
      key: 'actions',
      header: '',
      render: (u) => (
        <Button
          size="sm"
          variant="outline"
          onClick={((e: MouseEvent) => {
            e.stopPropagation();
            setEditing(u);
            setRoles(u.roles ?? []);
          }) as never}
        >
          Rôles
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Utilisateurs</h1>
        <p className="text-sm text-muted-foreground">Gestion des comptes et des rôles (RBAC).</p>
      </header>

      <DataTable
        columns={columns}
        rows={users?.items ?? []}
        rowKey={(u) => u.id}
        loading={loadingUsers}
        page={page}
        total={users?.pagination?.total}
        limit={10}
        onPageChange={setPage}
      />

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={`Rôles — ${editing?.email ?? ''}`}>
        <div className="space-y-3">
          {ALL_ROLES.map((r) => (
            <Checkbox
              key={r}
              id={`role-${r}`}
              label={r}
              checked={roles.includes(r)}
              onChange={(e) => {
                setRoles((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)));
              }}
            />
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Annuler</Button>
            <Button size="sm" loading={saveRoles.isPending} onClick={() => saveRoles.mutate()}>
              Enregistrer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

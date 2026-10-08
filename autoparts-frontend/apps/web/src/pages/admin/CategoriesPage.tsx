// ── CRUD catégories avec arborescence (super_admin) ────────────
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {Skeleton, Button, Card, CardContent, Input, Select, Modal } from '@autoparts/ui';
import { categoriesAdminApi } from '@autoparts/api';
import { CategoryTree, buildCategoryTree } from '@autoparts/ui';
import type { Category, CategoryNode } from '@autoparts/types';

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<CategoryNode | null>(null);
  const [newName, setNewName] = useState('');
  const [newParent, setNewParent] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: categoriesAdminApi.list,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'categories'] });

  const create = useMutation({
    mutationFn: () => categoriesAdminApi.create({ name: newName, parentId: newParent || undefined }),
    onSuccess: () => {
      toast.success('Catégorie créée');
      setNewName('');
      setNewParent('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: () => categoriesAdminApi.update(selected!.id, { name: newName }),
    onSuccess: () => {
      toast.success('Catégorie renommée');
      setRenameOpen(false);
      setNewName('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: () =>
      categoriesAdminApi.update(selected!.id, { parentId: moveTarget || null }),
    onSuccess: () => {
      toast.success('Catégorie déplacée');
      setMoveTarget('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => categoriesAdminApi.remove(id),
    onSuccess: () => {
      toast.success('Catégorie supprimée');
      setSelected(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Catégories</h1>
        <p className="text-sm text-muted-foreground">
          Arborescence hiérarchique — la suppression est refusée si des enfants ou produits existent.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
            ) : (
              <CategoryTree categories={categories} selectedId={selected?.id} onSelect={setSelected} />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3">
              <h2 className="font-semibold">Nouvelle catégorie</h2>
              <Input placeholder="Nom" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Select value={newParent} onChange={(e) => setNewParent(e.target.value)}>
                <option value="">Racine (sans parent)</option>
                {buildCategoryTree(categories).flatMap(function flatten(c): Array<{ id: string; label: string }> {
                  const label = `${'—'.repeat(c.depth + 1)} ${c.name}`;
                  return [{ id: c.id, label }, ...c.children.flatMap(flatten)];
                }).map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </Select>
              <Button size="sm" disabled={!newName} loading={create.isPending} onClick={() => create.mutate()}>
                Créer
              </Button>
            </CardContent>
          </Card>

          {selected && (
            <Card>
              <CardContent className="space-y-3">
                <h2 className="font-semibold">« {selected.name} »</h2>
                <p className="text-xs text-muted-foreground">
                  Profondeur {selected.depth} · {selected.children.length} sous-catégorie(s) · slug {selected.slug}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setNewName(selected.name); setRenameOpen(true); }}>
                    Renommer
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    loading={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Supprimer « ${selected.name} » ?`)) remove.mutate(selected.id);
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
                <Select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
                  <option value="">Déplacer vers… racine</option>
                  {categories
                    .filter((c: Category) => c.id !== selected.id)
                    .map((c: Category) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </Select>
                {moveTarget !== '' && (
                  <Button size="sm" loading={move.isPending} onClick={() => move.mutate()}>
                    Déplacer ici
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Modal open={renameOpen} onClose={() => setRenameOpen(false)} title="Renommer la catégorie">
        <div className="space-y-3">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRenameOpen(false)}>Annuler</Button>
            <Button size="sm" loading={rename.isPending} onClick={() => rename.mutate()}>Enregistrer</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

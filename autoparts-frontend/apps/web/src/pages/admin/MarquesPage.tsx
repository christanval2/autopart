// ── CRUD marques (super_admin) ─────────────────────────────────
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {Skeleton, Badge, Button, Card, CardContent, Input, Select, Switch } from '@autoparts/ui';
import { brandsAdminApi } from '@autoparts/api';
import type { Brand } from '@autoparts/types';

export default function MarquesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [isOem, setIsOem] = useState(false);
  const [country, setCountry] = useState('');

  const { data: brands = [], isLoading } = useQuery({
    queryKey: ['admin', 'brands'],
    queryFn: brandsAdminApi.list,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin', 'brands'] });

  const create = useMutation({
    mutationFn: () =>
      brandsAdminApi.create({ name, isOem, countryOfOrigin: country || undefined }),
    onSuccess: () => {
      toast.success('Marque créée');
      setName('');
      setCountry('');
      setIsOem(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (b: Brand) => brandsAdminApi.update(b.id, { isActive: !b.isActive }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => brandsAdminApi.remove(id),
    onSuccess: () => { toast.success('Marque supprimée'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Marques</h1>
        <p className="text-sm text-muted-foreground">
          Référentiel global — une marque avec des produits rattachés ne peut pas être supprimée.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit">
          <CardContent className="space-y-3">
            <h2 className="font-semibold">Nouvelle marque</h2>
            <Input placeholder="Nom de la marque" value={name} onChange={(e) => setName(e.target.value)} />
            <Select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Pays d'origine (optionnel)</option>
              <option value="JP">Japon</option>
              <option value="DE">Allemagne</option>
              <option value="FR">France</option>
              <option value="US">États-Unis</option>
              <option value="CN">Chine</option>
              <option value="KR">Corée du Sud</option>
            </Select>
            <Switch checked={isOem} onChange={setIsOem} label="Pièces d'origine (OEM)" />
            <Button size="sm" disabled={!name} loading={create.isPending} onClick={() => create.mutate()}>
              Créer
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
            ) : (
              <ul className="divide-y divide-border ">
                {brands.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{b.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.countryOfOrigin ? `Origine : ${b.countryOfOrigin} · ` : ''}
                        {b.isOem ? 'OEM' : 'Aftermarket'}
                      </div>
                    </div>
                    {b.isOem && <Badge tone="success">OEM</Badge>}
                    {b.isActive ? <Badge tone="neutral">Active</Badge> : <Badge tone="danger">Inactive</Badge>}
                    <Switch checked={b.isActive} onChange={() => toggle.mutate(b)} />
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (window.confirm(`Supprimer « ${b.name} » ?`)) remove.mutate(b.id);
                      }}
                    >
                      Supprimer
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

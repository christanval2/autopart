import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Modal, Badge } from '@autoparts/ui';
import { addressesApi, usersApi, authApi, getBlob, walletApi } from '@autoparts/api';
import { AddressAutocomplete } from '@/components/geo/AddressAutocomplete';
import { addressSchema, changePasswordSchema } from '@autoparts/utils';
import { useAuthStore } from '@/store/auth.store';
import type { Address } from '@autoparts/types';
import { z } from 'zod';

export default function ComptePage() {
  const { user, tokens, setSession, logout } = useAuthStore();
  const qc = useQueryClient();

  // ── Wallet (V3) ──────────────────────────────────────────────
  const { data: walletBalance } = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: walletApi.balance,
  });
  const { data: walletHistory = [] } = useQuery({
    queryKey: ['wallet', 'history'],
    queryFn: walletApi.history,
  });

  // ── Profil ───────────────────────────────────────────────────
  const profileForm = useForm<{
    firstName: string;
    lastName: string;
    phone: string;
  }>({
    values: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      phone: user?.phone ?? '',
    },
  });

  const saveProfile = profileForm.handleSubmit(async (v) => {
    try {
      const updated = await usersApi.updateProfile(v);
      if (tokens) setSession(tokens, { ...user!, ...updated });
      toast.success('Profil mis à jour');
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  // ── Adresses ─────────────────────────────────────────────────
  const { data: addresses = [] } = useQuery({
    queryKey: ['addresses'],
    queryFn: addressesApi.list,
  });

  const [addressOpen, setAddressOpen] = useState(false);
  const addressForm = useForm<
    z.input<typeof addressSchema>,
    unknown,
    z.output<typeof addressSchema>
  >({
    resolver: zodResolver(addressSchema),
    defaultValues: { countryCode: 'CM' },
  });

  const addAddress = addressForm.handleSubmit(async (v) => {
    try {
      // Zod a déjà validé les champs requis — fallbacks inoffensifs pour le typage
      await addressesApi.create({
        label: v.label ?? '',
        street: v.street ?? '',
        city: v.city ?? '',
        postalCode: v.postalCode,
        countryCode: v.countryCode ?? 'CM',
        isDefault: v.isDefault,
      });
      await qc.invalidateQueries({ queryKey: ['addresses'] });
      addressForm.reset({ countryCode: 'CM' });
      setAddressOpen(false);
      toast.success('Adresse ajoutée');
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  const removeAddress = useMutation({
    mutationFn: addressesApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }),
  });

  // ── Sécurité ─────────────────────────────────────────────────
  const pwdForm = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
  });
  const changePwd = pwdForm.handleSubmit(async (v) => {
    try {
      await authApi.changePassword(v.currentPassword, v.newPassword);
      pwdForm.reset();
      toast.success('Mot de passe modifié — vos autres sessions ont été invalidées');
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Mon compte</h1>
        <div className="ml-auto flex flex-wrap gap-1">
          {(user?.roles ?? []).map((r) => (
            <Badge key={r} tone="primary">{r}</Badge>
          ))}
          {user?.isVerified ? (
            <Badge tone="success">Email vérifié</Badge>
          ) : (
            <Badge tone="accent">Email non vérifié</Badge>
          )}
        </div>
      </header>

      {/* Profil */}
      <Card>
        <CardHeader><CardTitle>Informations personnelles</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-3" onSubmit={saveProfile}>
            <div>
              <label className="mb-1 block text-sm font-medium">Prénom</label>
              <Input {...profileForm.register('firstName')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Nom</label>
              <Input {...profileForm.register('lastName')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Téléphone</label>
              <Input placeholder="+237 6XX XXX XXX" {...profileForm.register('phone')} />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" size="sm">Enregistrer</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Adresses */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Adresses de livraison</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setAddressOpen(true)}>+ Ajouter</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {addresses.length === 0 && <p className="text-sm text-muted-foreground">Aucune adresse enregistrée.</p>}
          {addresses.map((a: Address) => (
            <div
              key={a.id}
              className="flex items-start justify-between rounded-input border border-border p-3"
            >
              <div>
                <div className="text-sm font-medium">
                  {a.label} {a.isDefault && <Badge tone="success">Par défaut</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {a.street}, {a.city} ({a.countryCode ?? 'CM'})
                </div>
              </div>
              <button
                className="text-xs text-destructive hover:underline"
                onClick={() => removeAddress.mutate(a.id)}
              >
                Supprimer
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Sécurité */}
      <Card>
        <CardHeader><CardTitle>Sécurité</CardTitle></CardHeader>
        <CardContent>
          <form className="max-w-md space-y-3" onSubmit={changePwd}>
            <div>
              <label className="mb-1 block text-sm font-medium">Mot de passe actuel</label>
              <Input type="password" {...pwdForm.register('currentPassword')} />
              {pwdForm.formState.errors.currentPassword && (
                <p className="mt-1 text-xs text-destructive">{pwdForm.formState.errors.currentPassword.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Nouveau mot de passe</label>
              <Input type="password" {...pwdForm.register('newPassword')} />
              {pwdForm.formState.errors.newPassword && (
                <p className="mt-1 text-xs text-destructive">{pwdForm.formState.errors.newPassword.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Confirmation</label>
              <Input type="password" {...pwdForm.register('confirmPassword')} />
            </div>
            <Button type="submit" size="sm">Changer le mot de passe</Button>
          </form>
        </CardContent>
      </Card>

      {/* Wallet */}
      <Card>
        <CardHeader><CardTitle>Portefeuille</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Solde disponible</span>
            <span className="text-2xl font-bold">
              {walletBalance ? `${walletBalance.balance.toLocaleString('fr-FR')} FCFA` : '—'}
            </span>
          </div>
          {walletHistory.length > 0 && (
            <ul className="divide-y divide-border text-sm ">
              {walletHistory.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <span>{t.description ?? t.type}</span>
                  <span className={`font-medium ${t.type === 'credit' || t.type === 'refund' ? 'text-success' : 'text-destructive'}`}>
                    {t.type === 'credit' || t.type === 'refund' ? '+' : '-'}{t.amount.toLocaleString('fr-FR')} FCFA
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Rechargement via MoMo/virement et retrait vers Mobile Money : disponibles auprès du
            support (routes de retrait en cours d'extension côté API).
          </p>
        </CardContent>
      </Card>

      {/* RGPD */}
      <Card>
        <CardHeader><CardTitle>Confidentialité (RGPD)</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Vos données sont conservées selon les durées légales (commandes : 10 ans, logs : 90 jours).
            Exportez toutes vos données (profil, adresses, commandes, avis, consentements) au format
            JSON, ou demandez la suppression de votre compte.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const blob = await getBlob('/users/me/export');
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `autoparts-mes-donnees-${(user?.id ?? '').slice(0, 8)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  toast.error((e as Error).message ?? 'Export indisponible');
                }
              }}
            >
              Exporter mes données (RGPD)
            </Button>
          </div>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            Supprimer mon compte
          </Button>
        </CardContent>
      </Card>

      {/* Modal ajout adresse */}
      <Modal open={addressOpen} onClose={() => setAddressOpen(false)} title="Nouvelle adresse">
        <form className="space-y-3" onSubmit={addAddress}>
          <Input placeholder="Libellé (Maison, Bureau…)" {...addressForm.register('label')} />
          {addressForm.formState.errors.label && (
            <p className="text-xs text-destructive">{addressForm.formState.errors.label.message}</p>
          )}
          {/* Autocomplete Geoapify — remplit rue + ville */}
          <AddressAutocomplete
            value={addressForm.watch('street') ?? ''}
            onSelect={(s) => {
              addressForm.setValue('street', s.street ?? s.address, { shouldValidate: true });
              if (s.city) addressForm.setValue('city', s.city, { shouldValidate: true });
            }}
          />
          <Input placeholder="Adresse (rue, quartier)" {...addressForm.register('street')} />
          {addressForm.formState.errors.street && (
            <p className="text-xs text-destructive">{addressForm.formState.errors.street.message}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Ville (Douala)" {...addressForm.register('city')} />
            <Input placeholder="Code postal (optionnel)" {...addressForm.register('postalCode')} />
          </div>
          {addressForm.formState.errors.city && (
            <p className="text-xs text-destructive">{addressForm.formState.errors.city.message}</p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...addressForm.register('isDefault')} /> Définir comme adresse par défaut
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddressOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm">Ajouter</Button>
          </div>
        </form>
      </Modal>

      {/* Modal suppression compte */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Supprimer le compte">
        <p className="text-sm text-muted-foreground">
          Votre compte sera anonymisé (RGPD) : les commandes restent conservées pour les obligations
          légales mais ne sont plus rattachées à votre identité. Cette action est irréversible.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(false)}>Annuler</Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              await usersApi.deleteAccount();
              await logout();
              window.location.href = '/';
            }}
          >
            Confirmer la suppression
          </Button>
        </div>
      </Modal>
    </div>
  );
}

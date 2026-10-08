import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner-native';
import { addressesApi, type AddressInput } from '@autoparts/api';
import { useAuthStore } from '../../src/store/auth.store';
import { TextField } from '../../src/components/ui/TextField';
import { Button } from '../../src/components/ui/Button';

/** Formulaire d'adresse — création ou édition (param `id`). */
export default function NouvelleAdresseScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id;
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: existing } = useQuery({
    queryKey: ['addresses', editingId],
    queryFn: async () => {
      const all = await addressesApi.list();
      return all.find((a) => a.id === editingId) ?? null;
    },
    enabled: isAuthenticated && Boolean(editingId),
  });

  const [form, setForm] = useState({
    label: '',
    street: '',
    city: '',
    postalCode: '',
    countryCode: 'CM',
    isDefault: false,
  });
  const [prefilled, setPrefilled] = useState(false);

  // Pré-remplit en mode édition.
  if (editingId && existing && !prefilled) {
    setPrefilled(true);
    setForm({
      label: existing.label ?? '',
      street: existing.street,
      city: existing.city,
      postalCode: existing.postalCode ?? '',
      countryCode: existing.countryCode ?? 'CM',
      isDefault: Boolean(existing.isDefault),
    });
  }

  const save = useMutation({
    mutationFn: () => {
      const dto: AddressInput = {
        label: form.label.trim() || undefined,
        street: form.street.trim(),
        city: form.city.trim(),
        postalCode: form.postalCode.trim() || undefined,
        countryCode: form.countryCode.trim().toUpperCase() || undefined,
        isDefault: form.isDefault,
      };
      return editingId ? addressesApi.update(editingId, dto) : addressesApi.create(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
      toast.success(editingId ? 'Adresse mise à jour' : 'Adresse ajoutée');
      router.back();
    },
    onError: (e: Error) => toast.error(e.message ?? 'Enregistrement impossible'),
  });

  if (!isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6 dark:bg-slate-900">
        <Text className="mb-3 text-center text-sm text-slate-500">Connectez-vous pour gérer vos adresses.</Text>
        <Pressable className="rounded-full bg-primary px-5 py-2.5" onPress={() => router.push('/(auth)/login')}>
          <Text className="font-semibold text-white">Se connecter</Text>
        </Pressable>
      </View>
    );
  }

  const valid =
    form.street.trim().length >= 5 && form.city.trim().length >= 2;

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-900" contentContainerClassName="gap-4 p-6 pb-24">
      <TextField
        label="Libellé (facultatif)"
        placeholder="Maison, bureau…"
        value={form.label}
        onChangeText={(v) => setForm({ ...form, label: v })}
      />
      <TextField
        label="Rue / voie *"
        placeholder="Rue, quartier, repère… (5 caractères min.)"
        value={form.street}
        onChangeText={(v) => setForm({ ...form, street: v })}
      />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <TextField label="Ville *" value={form.city} onChangeText={(v) => setForm({ ...form, city: v })} />
        </View>
        <View className="w-28">
          <TextField
            label="Code postal"
            value={form.postalCode}
            onChangeText={(v) => setForm({ ...form, postalCode: v })}
          />
        </View>
      </View>
      <TextField
        label="Pays (code 2 lettres)"
        placeholder="CM"
        autoCapitalize="characters"
        maxLength={2}
        value={form.countryCode}
        onChangeText={(v) => setForm({ ...form, countryCode: v.toUpperCase() })}
      />

      <Pressable
        className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
        onPress={() => setForm({ ...form, isDefault: !form.isDefault })}
      >
        <View className="flex-1">
          <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">Adresse par défaut</Text>
          <Text className="text-xs text-slate-400">Utilisée automatiquement au checkout</Text>
        </View>
        <View
          className={`h-7 w-12 items-center rounded-full p-0.5 ${form.isDefault ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <View
            className={`h-6 w-6 rounded-full bg-white shadow ${form.isDefault ? 'ml-auto' : ''}`}
          />
        </View>
      </Pressable>

      <Button
        label={save.isPending ? 'Enregistrement…' : editingId ? 'Mettre à jour' : 'Ajouter l’adresse'}
        disabled={!valid || save.isPending}
        onPress={() => save.mutate()}
      />
      <Text className="text-center text-[11px] text-slate-400">
        * Rue (5 caractères min.) et ville obligatoires.
      </Text>
    </ScrollView>
  );
}

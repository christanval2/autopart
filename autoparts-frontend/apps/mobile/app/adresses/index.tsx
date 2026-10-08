import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Trash2 } from 'lucide-react-native';
import { toast } from 'sonner-native';
import { addressesApi } from '@autoparts/api';
import { useAuthStore } from '../../src/store/auth.store';
import { Button } from '../../src/components/ui/Button';
import { EmptyState } from '../../src/components/ui/EmptyState';
import type { Address } from '@autoparts/types';

export default function AdressesScreen() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: addressesApi.list,
    enabled: isAuthenticated,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['addresses'] });

  const remove = useMutation({
    mutationFn: addressesApi.remove,
    onSuccess: () => {
      toast.success('Adresse supprimée');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? 'Suppression impossible'),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => addressesApi.update(id, { isDefault: true }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message ?? 'Opération impossible'),
  });

  const confirmRemove = (a: Address) =>
    Alert.alert('Supprimer l’adresse', `${a.street}, ${a.city} ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => remove.mutate(a.id) },
    ]);

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

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-900" contentContainerClassName="gap-3 p-4 pb-24">
      <Button label="+ Ajouter une adresse de livraison" onPress={() => router.push('/adresses/nouveau')} />

      {isLoading ? (
        <Text className="py-8 text-center text-sm text-slate-400">Chargement…</Text>
      ) : addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Aucune adresse"
          body="Ajoutez une adresse de livraison pour recevoir vos commandes."
        />
      ) : (
        addresses.map((a) => (
          <View
            key={a.id}
            className="rounded-[20px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold text-slate-900 dark:text-slate-50">
                {a.label || 'Adresse'}
              </Text>
              {a.isDefault ? (
                <Text className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
                  Par défaut
                </Text>
              ) : null}
            </View>
            <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {a.street}, {a.city}
              {a.postalCode ? ` · ${a.postalCode}` : ''}
              {a.countryCode ? ` (${a.countryCode})` : ''}
            </Text>
            <View className="mt-3 flex-row items-center gap-2">
              {!a.isDefault ? (
                <Pressable
                  className="rounded-full border border-slate-300 px-3 py-1.5 dark:border-slate-600"
                  onPress={() => setDefault.mutate(a.id)}
                >
                  <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Définir par défaut
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                className="flex-row items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 dark:border-slate-600"
                onPress={() => router.push({ pathname: '/adresses/nouveau', params: { id: a.id } })}
              >
                <Pencil size={12} color="#5B616E" />
                <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">Modifier</Text>
              </Pressable>
              <Pressable
                className="flex-row items-center gap-1 rounded-full border border-danger/40 px-3 py-1.5"
                onPress={() => confirmRemove(a)}
              >
                <Trash2 size={12} color="#C92F3E" />
                <Text className="text-xs font-semibold text-danger">Supprimer</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

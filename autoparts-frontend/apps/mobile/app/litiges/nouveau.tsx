import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner-native';
import { disputesApi } from '@autoparts/api';
import { useAuthStore } from '../../src/store/auth.store';

const REASONS: Array<{ value: string; label: string }> = [
  { value: 'not_received', label: "Commande jamais reçue" },
  { value: 'wrong_item', label: 'Mauvais article reçu' },
  { value: 'quality', label: 'Produit défectueux / qualité' },
  { value: 'payment', label: 'Problème de paiement' },
  { value: 'other', label: 'Autre motif' },
];

export default function NouveauLitigeScreen() {
  const params = useLocalSearchParams<{ orderId?: string; orderNumber?: string }>();
  const { isAuthenticated } = useAuthStore();
  const [reason, setReason] = useState(REASONS[0].value);
  const [description, setDescription] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      disputesApi.create({
        orderId: params.orderId!,
        reason,
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Litige ouvert — notre équipe revient vers vous sous 48 h.');
      router.replace('/(tabs)/commandes');
    },
    onError: (e: Error) => toast.error(e.message ?? "Impossible d'ouvrir le litige"),
  });

  if (!isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6 dark:bg-slate-900">
        <Text className="mb-3 text-center text-sm text-slate-500">
          Connectez-vous pour ouvrir un litige.
        </Text>
        <Pressable className="rounded-lg bg-primary px-5 py-2.5" onPress={() => router.push('/(auth)/login')}>
          <Text className="font-semibold text-white">Se connecter</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-900" contentContainerClassName="p-4 gap-4">
      <View className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <Text className="text-sm font-semibold">Commande concernée</Text>
        <Text className="mt-1 text-sm text-slate-500">{params.orderNumber ?? params.orderId}</Text>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold">Motif</Text>
        {REASONS.map((r) => (
          <Pressable
            key={r.value}
            className={`rounded-lg border px-3 py-2.5 ${
              reason === r.value ? 'border-primary bg-primary/10' : 'border-slate-300 dark:border-slate-600'
            }`}
            onPress={() => setReason(r.value)}
          >
            <Text className={`text-sm ${reason === r.value ? 'font-semibold text-primary' : ''}`}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold">Description (facultatif)</Text>
        <TextInput
          className="min-h-[90px] rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Décrivez le problème rencontré…"
          multiline
          textAlignVertical="top"
          value={description}
          onChangeText={setDescription}
        />
      </View>

      <Pressable
        className="rounded-lg bg-danger py-3 disabled:opacity-50"
        disabled={submit.isPending}
        onPress={() => submit.mutate()}
      >
        <Text className="text-center font-semibold text-white">
          {submit.isPending ? 'Envoi…' : 'Ouvrir le litige'}
        </Text>
      </Pressable>
      <Text className="text-center text-[11px] text-slate-400">
        Un litige est transmis à notre équipe support qui arbitre entre vous et le vendeur.
      </Text>
    </ScrollView>
  );
}

import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { shipmentsApi } from '@autoparts/api';
import { formatDateTime } from '@autoparts/utils';

const STEPS = [
  { key: 'preparing', label: 'Préparation' },
  { key: 'in_transit', label: 'En transit' },
  { key: 'out_for_delivery', label: 'En livraison' },
  { key: 'delivered', label: 'Livré' },
];

export default function SuiviScreen() {
  const { tracking } = useLocalSearchParams<{ tracking: string }>();
  const [value, setValue] = useState(tracking ?? '');
  const [active, setActive] = useState(tracking ?? '');

  const { data: shipment } = useQuery({
    queryKey: ['shipments', 'track', active],
    queryFn: () => shipmentsApi.track(active),
    enabled: active.length >= 4,
  });

  const idx = shipment ? STEPS.findIndex((s) => s.key === shipment.status) : -1;

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-900" contentContainerClassName="p-4 gap-4">
      <TextInput
        className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        placeholder="Numéro de suivi (ex. DHL123456789)"
        value={value}
        onChangeText={setValue}
      />
      <Pressable
        className="rounded-lg bg-primary py-3 disabled:opacity-50"
        disabled={value.trim().length < 4}
        onPress={() => setActive(value.trim())}
      >
        <Text className="text-center font-semibold text-white">Suivre le colis</Text>
      </Pressable>

      {shipment && (
        <View className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <View className="mb-3 flex-row justify-between">
            <View>
              <Text className="text-xs text-slate-400">Transporteur</Text>
              <Text className="font-semibold">{shipment.carrier ?? '—'}</Text>
            </View>
            <View className="items-end">
              <Text className="text-xs text-slate-400">Statut</Text>
              <Text className="font-semibold">{shipment.status}</Text>
            </View>
          </View>
          {STEPS.map((s, i) => (
            <View key={s.key} className="flex-row items-center gap-2 py-1">
              <View className={`h-3 w-3 rounded-full ${i <= idx ? 'bg-success' : 'bg-slate-300'}`} />
              <Text className={`text-sm ${i <= idx ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}>
                {s.label}
              </Text>
            </View>
          ))}
          {shipment.deliveredAt && (
            <Text className="mt-2 text-xs text-success">Livré le {formatDateTime(shipment.deliveredAt)}</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

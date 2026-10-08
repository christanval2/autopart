import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  CircleAlert,
  ClipboardList,
  MapPin,
  Package,
  Truck,
  Warehouse,
} from 'lucide-react-native';
import { shipmentsApi } from '@autoparts/api';
import { formatDate } from '@autoparts/utils';
import type { TrackedShipment } from '@autoparts/types';
import { RouteMap, resolveRouteCoords } from '../../src/components/RouteMap';

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

  const { data: shipment, isError, isLoading } = useQuery({
    queryKey: ['shipments', 'track', active],
    queryFn: () => shipmentsApi.track(active) as Promise<TrackedShipment>,
    enabled: active.length >= 4,
    retry: false,
  });

  const statusIndex = shipment ? STEPS.findIndex((s) => s.key === shipment.status) : -1;
  const progress = shipment?.progress ?? (statusIndex >= 0 ? statusIndex / (STEPS.length - 1) : 0);
  const routeCoords = shipment
    ? resolveRouteCoords(shipment.originCity, shipment.destinationCity)
    : null;

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-900" contentContainerClassName="gap-4 p-4 pb-24">
      <Text className="text-[25px] font-bold tracking-[-0.3px] text-slate-900 dark:text-slate-50">
        Suivi de colis
      </Text>

      <View className="flex-row items-center gap-2">
        <TextInput
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Numéro de suivi (ex. DHL123456789)"
          value={value}
          onChangeText={setValue}
          onSubmitEditing={() => setActive(value.trim())}
          returnKeyType="search"
        />
        <Pressable className="rounded-lg bg-primary px-4 py-3" onPress={() => setActive(value.trim())}>
          <Text className="font-semibold text-white">Suivre</Text>
        </Pressable>
      </View>

      {isLoading && active.length >= 4 ? (
        <Text className="text-center text-sm text-slate-400">Recherche du colis…</Text>
      ) : null}

      {isError ? (
        <View className="flex-row items-center gap-2 rounded-[20px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <CircleAlert size={18} color="#97A0AC" />
          <Text className="flex-1 text-sm text-slate-500">
            Aucun colis trouvé pour « {active} ». Vérifiez le numéro de suivi.
          </Text>
        </View>
      ) : null}

      {shipment ? (
        <>
          {/* ── Itinéraire origine → destination ── */}
          <View className="rounded-[20px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <Text className="mb-3 text-[11.5px] font-medium uppercase tracking-[1.4px] text-slate-400">
              Itinéraire
            </Text>            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-1 items-start gap-1">
                <View className="flex-row items-center gap-1.5">
                  <Warehouse size={14} color="#5B616E" />
                  <Text className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {shipment.originWarehouse ?? 'Entrepôt'}
                  </Text>
                </View>
                <Text className="text-[11px] text-slate-400">{shipment.originCity ?? ''}</Text>
              </View>
              <View className="flex-1 items-end gap-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-right text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {shipment.destinationCity ?? 'Destination'}
                  </Text>
                  <MapPin size={14} color="#C92F3E" />
                </View>
                <Text className="text-right text-[11px] text-slate-400">
                  {shipment.destinationLabel ?? ''}
                </Text>
              </View>
            </View>

            {/* Barre de progression avec camion */}
            <View className="my-3">
              <View className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <View
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
                />
              </View>
              <View
                className="absolute -top-2"
                style={{ left: `${Math.round(Math.min(1, Math.max(0, progress)) * 96)}%` }}
              >
                <View className="h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-white dark:bg-slate-900">
                  <Truck size={15} color="#C92F3E" />
                </View>
              </View>
            </View>

            {shipment.deliveredAt ? (
              <Text className="text-center text-xs font-semibold text-success">
                Livré le {formatDate(shipment.deliveredAt)} 🎉
              </Text>
            ) : shipment.shippedAt ? (
              <Text className="text-center text-xs text-slate-400">
                Expédié le {formatDate(shipment.shippedAt)}
              </Text>
            ) : null}
          </View>

          {/* ── Carte du trajet (si les villes sont connues) ── */}
          {routeCoords ? (
            <RouteMap
              originName={shipment.originWarehouse ?? shipment.originCity ?? 'Origine'}
              origin={routeCoords.origin}
              destinationName={shipment.destinationLabel ?? shipment.destinationCity ?? 'Destination'}
              destination={routeCoords.destination}
              progress={progress}
            />
          ) : null}

          {/* ── Étapes ── */}
          <View className="rounded-[20px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <Text className="mb-3 text-[11.5px] font-medium uppercase tracking-[1.4px] text-slate-400">
              Étapes
            </Text>
            {STEPS.map((s, i) => {
              const done = statusIndex >= i;
              const current = statusIndex === i;
              return (
                <View key={s.key} className="flex-row items-center gap-3 py-1.5">
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-full ${
                      done ? 'bg-success' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  >
                    {done ? <Check size={12} color="#FFFFFF" /> : null}
                  </View>
                  <Text
                    className={`flex-1 text-sm ${current ? 'font-bold text-slate-900 dark:text-slate-50' : done ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400'}`}
                  >
                    {s.label}
                  </Text>
                  {current ? (
                    <Text className="text-[10px] font-bold uppercase tracking-wide text-accent">En cours</Text>
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* ── Détails colis ── */}
          <View className="rounded-[20px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <Text className="mb-3 text-[11.5px] font-medium uppercase tracking-[1.4px] text-slate-400">
              Détails
            </Text>
            <View className="gap-2">
              <DetailRow icon={Truck} label="Transporteur" value={shipment.carrier ?? '—'} />
              <DetailRow icon={ClipboardList} label="N° de suivi" value={shipment.trackingNumber ?? '—'} />
              {shipment.parcelInfo?.nbColis ? (
                <DetailRow icon={Package} label="Colis" value={`${shipment.parcelInfo.nbColis}`} />
              ) : null}
              {shipment.parcelInfo?.weightKg ? (
                <DetailRow icon={Package} label="Poids" value={`${shipment.parcelInfo.weightKg} kg`} />
              ) : null}
              {shipment.parcelInfo?.dimensions ? (
                <DetailRow icon={Package} label="Dimensions" value={shipment.parcelInfo.dimensions} />
              ) : null}
              {shipment.pickupCode ? (
                <DetailRow icon={MapPin} label="Code de retrait" value={shipment.pickupCode} />
              ) : null}
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        <Icon size={14} color="#97A0AC" />
        <Text className="text-sm text-slate-500 dark:text-slate-400">{label}</Text>
      </View>
      <Text className="text-sm font-semibold text-slate-900 dark:text-slate-50">{value}</Text>
    </View>
  );
}

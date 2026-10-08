import { FlatList, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Tag } from 'lucide-react-native';
import { promotionsApi } from '@autoparts/api';
import type { Promotion } from '@autoparts/api';
import { formatDate, formatPrice } from '@autoparts/utils';

const TYPE_LABELS: Record<Promotion['type'], string> = {
  percentage: 'Remise %',
  fixed: 'Remise fixe',
  free_shipping: 'Livraison offerte',
  bogo: '1 acheté = 1 offert',
};

function discountLabel(p: Promotion): string {
  if (p.type === 'percentage') return `−${Number(p.discountValue ?? 0)}%`;
  if (p.type === 'fixed') return `−${formatPrice(Number(p.discountValue ?? 0))}`;
  if (p.type === 'free_shipping') return 'Port offert';
  return '2 pour 1';
}

export default function PromotionsScreen() {
  const { data: promos = [], isLoading } = useQuery({
    queryKey: ['promotions', 'active'],
    queryFn: () => promotionsApi.list(true),
  });

  return (
    <FlatList
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      contentContainerClassName="p-3 gap-2"
      data={promos}
      keyExtractor={(p) => p.id}
      ListEmptyComponent={
        isLoading ? (
          <Text className="py-16 text-center text-sm text-slate-400">Chargement…</Text>
        ) : (
          <Text className="py-16 text-center text-sm text-slate-400">Aucune promotion active.</Text>
        )
      }
      renderItem={({ item }) => (
        <View className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Tag size={16} color="#E07B00" />
              <Text className="font-bold">{item.name ?? 'Promotion'}</Text>
            </View>
            <Text className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
              {discountLabel(item)}
            </Text>
          </View>
          {item.code ? (
            <Text className="mt-1 text-xs text-slate-500">
              Code : <Text className="font-mono font-bold text-primary">{item.code}</Text>
            </Text>
          ) : null}
          <View className="mt-1 gap-0.5">
            {item.minOrderAmount ? (
              <Text className="text-xs text-slate-400">
                Dès {formatPrice(Number(item.minOrderAmount))} d'achat
              </Text>
            ) : null}
            {item.validUntil ? (
              <Text className="text-xs text-slate-400">Valable jusqu'au {formatDate(item.validUntil)}</Text>
            ) : null}
            {item.maxUses != null ? (
              <Text className="text-xs text-slate-400">
                {item.usesCount ?? 0} / {item.maxUses} utilisations
              </Text>
            ) : null}
          </View>
          <Text className="mt-1 text-[10px] uppercase tracking-wide text-slate-300">
            {TYPE_LABELS[item.type] ?? item.type}
          </Text>
        </View>
      )}
    />
  );
}

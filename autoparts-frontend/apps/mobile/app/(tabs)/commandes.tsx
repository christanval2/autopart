import { FlatList, Pressable, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react-native';
import { ordersApi } from '@autoparts/api';
import { formatDate, formatPrice } from '@autoparts/utils';
import { useAuthStore } from '../../src/store/auth.store';
import type { Order } from '@autoparts/types';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon', confirmed: 'Confirmée', processing: 'En traitement',
  shipped: 'Expédiée', delivered: 'Livrée', cancelled: 'Annulée', refunded: 'Remboursée',
};

export default function CommandesScreen() {
  const { isAuthenticated } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['orders', 'mobile'],
    queryFn: () => ordersApi.list({ limit: 20 }),
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6 dark:bg-slate-900">
        <Text className="mb-3 text-center text-sm text-slate-500">Connectez-vous pour voir vos commandes.</Text>
        <Link href="/(auth)/login" asChild>
          <Pressable className="rounded-lg bg-primary px-5 py-2.5">
            <Text className="font-semibold text-white">Se connecter</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      contentContainerClassName="p-3 gap-2"
      data={data?.items ?? []}
      keyExtractor={(o) => o.id}
      ListEmptyComponent={
        isLoading ? null : (
          <Text className="py-16 text-center text-sm text-slate-400">Aucune commande pour l'instant.</Text>
        )
      }
      renderItem={({ item }: { item: Order }) => (
        <View className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
          <View className="flex-row items-center justify-between">
            <Text className="font-semibold">{item.orderNumber}</Text>
            <Text
              className={`text-xs font-bold ${
                item.status === 'delivered' ? 'text-success' : item.status === 'cancelled' ? 'text-danger' : 'text-accent'
              }`}
            >
              {STATUS_LABELS[item.status] ?? item.status}
            </Text>
          </View>
          <Text className="mt-0.5 text-xs text-slate-400">
            {formatDate(item.createdAt)} · {item.lines?.length ?? 0} article(s)
          </Text>
          <Text className="mt-1 font-bold text-primary">{formatPrice(item.totalAmount)}</Text>
          {item.status !== 'draft' && item.status !== 'cancelled' ? (
            <Pressable
              className="mt-2 flex-row items-center gap-1.5 self-start rounded-lg bg-slate-100 px-2.5 py-1.5 dark:bg-slate-700"
              onPress={() =>
                router.push({
                  pathname: '/litiges/nouveau',
                  params: { orderId: item.id, orderNumber: item.orderNumber },
                })
              }
            >
              <TriangleAlert size={13} color="#DC2626" />
              <Text className="text-xs font-medium text-danger">Signaler un problème</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    />
  );
}

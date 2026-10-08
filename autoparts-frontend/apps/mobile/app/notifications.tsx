import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellRing,
  CheckCheck,
  Package,
  Percent,
  Tag,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { notificationsApi } from '@autoparts/api';
import { formatDateTime } from '@autoparts/utils';
import { useAuthStore } from '../src/store/auth.store';
import { EmptyState } from '../src/components/ui/EmptyState';
import type { NotificationType } from '@autoparts/types';

const TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  order_update: Package,
  stock_alert: Tag,
  payment: Wallet,
  promo: Percent,
  system: Bell,
};

export default function NotificationsScreen() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => notificationsApi.list(1, 30),
    enabled: isAuthenticated,
  });
  const items = data?.items ?? [];

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate });

  if (!isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6 dark:bg-slate-900">
        <Text className="mb-3 text-center text-sm text-slate-500">
          Connectez-vous pour voir vos notifications.
        </Text>
        <Pressable className="rounded-full bg-primary px-5 py-2.5" onPress={() => router.push('/(auth)/login')}>
          <Text className="font-semibold text-white">Se connecter</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900">
      {items.length > 0 ? (
        <Pressable
          className="mr-4 self-end rounded-full border border-slate-300 px-3 py-1.5 dark:border-slate-600"
          onPress={() => markAll.mutate()}
        >
          <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Tout marquer comme lu
          </Text>
        </Pressable>
      ) : null}

      <ScrollView contentContainerClassName="gap-2 p-3 pb-24">
        {isLoading ? (
          <Text className="py-12 text-center text-sm text-slate-400">Chargement…</Text>
        ) : items.length === 0 ? (
          <EmptyState
            icon={BellRing}
            title="Aucune notification"
            body="Les mises à jour de commandes, promos et alertes de stock arriveront ici."
          />
        ) : (
          items.map((n) => {
            const Icon = TYPE_ICONS[n.type] ?? Bell;
            return (
              <Pressable
                key={n.id}
                onPress={() => !n.isRead && markRead.mutate(n.id)}
                className={`flex-row items-start gap-3 rounded-2xl border p-3.5 ${
                  n.isRead
                    ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
                    : 'border-primary/30 bg-primary/5 dark:border-primary/40 dark:bg-primary/10'
                }`}
              >
                <View className="h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-900">
                  <Icon size={17} color="#C92F3E" />
                </View>
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className={`flex-1 text-sm ${n.isRead ? 'font-medium text-slate-700 dark:text-slate-200' : 'font-bold text-slate-900 dark:text-slate-50'}`}
                      numberOfLines={1}
                    >
                      {n.title}
                    </Text>
                    {!n.isRead ? <View className="h-2 w-2 rounded-full bg-primary" /> : null}
                  </View>
                  {n.body ? (
                    <Text className="text-xs text-slate-500 dark:text-slate-400" numberOfLines={2}>
                      {n.body}
                    </Text>
                  ) : null}
                  {n.createdAt ? (
                    <Text className="text-[10px] text-slate-400">{formatDateTime(n.createdAt)}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

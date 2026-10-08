import { Pressable, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@autoparts/api';
import { formatPrice } from '@autoparts/utils';
import { useAuthStore } from '../src/store/auth.store';

const num = (v: number | string | undefined) => Number(v ?? 0);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <Text className="mb-2 text-sm font-semibold">{title}</Text>
      {children}
    </View>
  );
}

function ErrorNote() {
  return (
    <Text className="text-xs text-slate-400">
      Données indisponibles (accès vendeur / administrateur requis).
    </Text>
  );
}

export default function StatsScreen() {
  const { isAuthenticated } = useAuthStore();

  const conversion = useQuery({ queryKey: ['analytics', 'conversion'], queryFn: analyticsApi.conversion });
  const top = useQuery({ queryKey: ['analytics', 'top', 5], queryFn: () => analyticsApi.topProducts(5) });
  const byCategory = useQuery({ queryKey: ['analytics', 'categories'], queryFn: () => analyticsApi.revenueByCategory() });
  const timeline = useQuery({ queryKey: ['analytics', 'timeline', 'month'], queryFn: () => analyticsApi.timeline('month') });

  if (!isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6 dark:bg-slate-900">
        <Text className="mb-3 text-center text-sm text-slate-500">Connectez-vous pour voir les statistiques.</Text>
        <Link href="/(auth)/login" asChild>
          <Pressable className="rounded-lg bg-primary px-5 py-2.5">
            <Text className="font-semibold text-white">Se connecter</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  const maxCategoryRevenue = Math.max(1, ...(byCategory.data ?? []).map((c) => num(c.revenue)));
  const recentTimeline = (timeline.data ?? []).slice(-6);
  const maxTimelineRevenue = Math.max(1, ...recentTimeline.map((t) => num(t.revenue)));

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-900" contentContainerClassName="p-3 gap-3">
      <Section title="Conversion">
        {conversion.isError ? (
          <ErrorNote />
        ) : (
          <View className="flex-row gap-3">
            <View className="flex-1 rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
              <Text className="text-[10px] uppercase text-slate-400">Recherches</Text>
              <Text className="text-lg font-bold">{num(conversion.data?.searches.totalSearches)}</Text>
            </View>
            <View className="flex-1 rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
              <Text className="text-[10px] uppercase text-slate-400">Commandes</Text>
              <Text className="text-lg font-bold">{num(conversion.data?.orders.totalOrders)}</Text>
            </View>
            <View className="flex-1 rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
              <Text className="text-[10px] uppercase text-slate-400">Note moyenne</Text>
              <Text className="text-lg font-bold">
                {num(conversion.data?.reviews.avgRating).toFixed(1)} ★
              </Text>
            </View>
          </View>
        )}
      </Section>

      <Section title="Top produits">
        {top.isError ? (
          <ErrorNote />
        ) : (
          <View className="gap-2">
            {(top.data ?? []).map((p, i) => (
              <View key={p.productId} className="flex-row items-center gap-2">
                <Text className="w-5 text-xs font-bold text-slate-400">{i + 1}.</Text>
                <Text className="flex-1 text-xs" numberOfLines={1}>
                  {p.name ?? p.sku ?? p.productId}
                </Text>
                <Text className="text-xs font-semibold text-primary">{num(p.totalQty)} vendus</Text>
              </View>
            ))}
            {(top.data ?? []).length === 0 ? (
              <Text className="text-xs text-slate-400">Aucune vente enregistrée.</Text>
            ) : null}
          </View>
        )}
      </Section>

      <Section title="Revenus par catégorie">
        {byCategory.isError ? (
          <ErrorNote />
        ) : (
          <View className="gap-2">
            {(byCategory.data ?? []).map((c) => (
              <View key={c.categoryId} className="gap-1">
                <View className="flex-row justify-between">
                  <Text className="text-xs">{c.categoryName ?? c.categoryId}</Text>
                  <Text className="text-xs font-semibold">{formatPrice(num(c.revenue))}</Text>
                </View>
                <View className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <View
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((num(c.revenue) / maxCategoryRevenue) * 100)}%` }}
                  />
                </View>
              </View>
            ))}
            {(byCategory.data ?? []).length === 0 ? (
              <Text className="text-xs text-slate-400">Aucune donnée.</Text>
            ) : null}
          </View>
        )}
      </Section>

      <Section title="Revenus par mois">
        {timeline.isError ? (
          <ErrorNote />
        ) : (
          <View className="flex-row items-end justify-between gap-2" style={{ minHeight: 90 }}>
            {recentTimeline.map((t) => (
              <View key={t.period} className="flex-1 items-center gap-1">
                <Text className="text-[9px] font-semibold text-slate-500">
                  {num(t.revenue) > 0 ? formatPrice(num(t.revenue)).replace(',00', '') : ''}
                </Text>
                <View
                  className="w-full rounded-t bg-accent"
                  style={{ height: Math.max(4, Math.round((num(t.revenue) / maxTimelineRevenue) * 70)) }}
                />
                <Text className="text-[9px] text-slate-400">{t.period.slice(5)}</Text>
              </View>
            ))}
            {recentTimeline.length === 0 ? (
              <Text className="text-xs text-slate-400">Aucune donnée.</Text>
            ) : null}
          </View>
        )}
      </Section>
    </ScrollView>
  );
}

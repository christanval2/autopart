import { useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View, ScrollView } from 'react-native';
import { Link, router } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Bell, Bot, Camera, Mic } from 'lucide-react-native';
import { productsApi, catalogApi, notificationsApi } from '@autoparts/api';
import { formatPrice } from '@autoparts/utils';
import type { Product } from '@autoparts/types';
import { ProductImage } from '../../src/components/ProductImage';
import { useAuthStore } from '../../src/store/auth.store';

export default function HomeScreen() {
  const [q, setQ] = useState('');
  const { isAuthenticated } = useAuthStore();

  const { data: categories = [] } = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: catalogApi.categories,
  });

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  // Fil infini : pages de 20 produits chargées à l'approche de la fin de liste.
  const products = useInfiniteQuery({
    queryKey: ['products', 'mobile', q],
    queryFn: ({ pageParam }) =>
      productsApi.list({ search: q || undefined, limit: 20, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const p = last.pagination;
      if (!p) return undefined;
      const nextPage = p.page + 1;
      return p.totalPages ? (nextPage <= p.totalPages ? nextPage : undefined) : undefined;
    },
  });
  const items = products.data?.pages.flatMap((page) => page.items ?? []) ?? [];

  const renderProduct = ({ item }: { item: Product }) => (
    <Link href={`/produits/${item.id}`} asChild>
      <Pressable className="m-1.5 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <ProductImage
          url={item.images?.[0]?.url}
          alt={item.name}
          containerClassName="h-24 w-full"
        />
        <View className="gap-1 p-2.5">
          <Text className="text-xs font-semibold text-slate-800 dark:text-slate-100" numberOfLines={2}>
            {item.name}
          </Text>
          <Text className="text-[10px] text-slate-400">{item.brand?.name ?? ''}</Text>
          <Text className="text-[15px] font-bold text-primary">{formatPrice(item.basePrice)}</Text>
        </View>
      </Pressable>
    </Link>
  );

  return (
    <FlatList
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      data={items}
      numColumns={2}
      keyExtractor={(item) => item.id}
      renderItem={renderProduct}
      stickyHeaderIndices={[0]}
      onEndReached={() => {
        if (products.hasNextPage && !products.isFetchingNextPage) {
          void products.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.4}
      columnWrapperClassName="justify-center"
      contentContainerClassName="pb-28"
      ListHeaderComponent={
        <View className="gap-2 bg-slate-50 px-3 pb-2 pt-3 dark:bg-slate-900">
          {/* En-tête : marque + cloche de notifications */}
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold tracking-[-0.3px] text-primary">AutoParts Cameroun</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
              onPress={() => router.push('/notifications')}
            >
              <Bell size={19} color="#5B616E" />
              {isAuthenticated && (unread ?? 0) > 0 ? (
                <View className="absolute -right-0.5 -top-0.5 min-w-[18px] items-center justify-center rounded-full bg-primary px-1 py-0.5">
                  <Text className="text-[9px] font-bold text-white">
                    {(unread ?? 0) > 99 ? '99+' : unread}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {/* Recherche + raccourcis */}
          <View className="flex-row items-center gap-2">
            <TextInput
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Référence OEM, pièce…"
              value={q}
              onChangeText={setQ}
              onSubmitEditing={() => void 0}
            />
            <Pressable className="rounded-lg bg-primary p-2.5" onPress={() => router.push('/scanner')}>
              <Camera color="white" size={20} />
            </Pressable>
            <Link href="/chatbot" asChild>
              <Pressable className="rounded-lg bg-accent p-2.5">
                <Bot color="white" size={20} />
              </Pressable>
            </Link>
            <Link href="/vocal" asChild>
              <Pressable className="rounded-lg bg-primary p-2.5">
                <Mic color="white" size={20} />
              </Pressable>
            </Link>
          </View>

          {/* Catégories */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {categories.slice(0, 10).map((c) => (
              <Pressable
                key={c.id}
                className="mr-2 rounded-full border border-slate-300 px-3 py-1 dark:border-slate-600"
                onPress={() => setQ(c.name)}
              >
                <Text className="text-xs text-slate-600 dark:text-slate-300">{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={
        products.isLoading ? (
          <Text className="py-8 text-center text-sm text-slate-400">Chargement…</Text>
        ) : (
          <Text className="py-8 text-center text-sm text-slate-400">Aucun produit trouvé.</Text>
        )
      }
      ListFooterComponent={
        products.isFetchingNextPage ? (
          <Text className="py-4 text-center text-xs text-slate-400">Chargement de la suite…</Text>
        ) : null
      }
    />
  );
}

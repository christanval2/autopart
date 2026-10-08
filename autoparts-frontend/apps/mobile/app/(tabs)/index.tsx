import { useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View, ScrollView } from 'react-native';
import { Link, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Bot, Camera, Mic } from 'lucide-react-native';
import { productsApi, catalogApi } from '@autoparts/api';
import { formatPrice } from '@autoparts/utils';
import type { Product } from '@autoparts/types';

export default function HomeScreen() {
  const [q, setQ] = useState('');

  const { data: categories = [] } = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: catalogApi.categories,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'mobile', q],
    queryFn: () => productsApi.list({ search: q || undefined, limit: 20 }),
  });

  const renderProduct = ({ item }: { item: Product }) => (
    <Link href={`/produits/${item.id}`} asChild>
      <Pressable className="m-1.5 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <View className="h-24 items-center justify-center bg-slate-100 dark:bg-slate-700">
          {item.images?.[0] ? (
            <Text>🖼</Text>
          ) : (
            <Text className="text-3xl">🔧</Text>
          )}
        </View>
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
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-900" stickyHeaderIndices={[0]}>
      <View className="gap-2 bg-slate-50 px-3 pb-2 pt-3 dark:bg-slate-900">
        <View className="flex-row items-center gap-2">
          <TextInput
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Référence OEM, pièce…"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => void 0}
          />
          <Pressable
            className="rounded-lg bg-primary p-2.5"
            onPress={() => router.push('/scanner')}
          >
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

      <View className="px-3 pb-24 pt-2">
        <Text className="mb-2 text-lg font-bold">{q ? `Résultats : ${q}` : 'Catalogue'}</Text>
        {isLoading ? (
          <Text className="text-sm text-slate-400">Chargement…</Text>
        ) : (
          <FlatList
            data={data?.items ?? []}
            keyExtractor={(item) => item.id}
            renderItem={renderProduct}
            numColumns={2}
            columnWrapperClassName="justify-center"
            scrollEnabled={false}
            ListEmptyComponent={
              <Text className="py-8 text-center text-sm text-slate-400">Aucun produit trouvé.</Text>
            }
          />
        )}
      </View>
    </ScrollView>
  );
}

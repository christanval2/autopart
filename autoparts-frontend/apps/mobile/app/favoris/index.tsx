import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { wishlistApi } from '@autoparts/api';
import { formatPrice } from '@autoparts/utils';

// Wishlist (routes réelles : GET/POST/DELETE /wishlist)
export default function FavorisScreen() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['wishlist'],
    queryFn: wishlistApi.list,
  });

  return (
    <FlatList
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      contentContainerClassName="p-3 gap-2"
      data={items}
      keyExtractor={(i, idx) => i.id ?? i.productId ?? String(idx)}
      ListEmptyComponent={
        isLoading ? null : (
          <Text className="py-16 text-center text-sm text-slate-400">
            Aucun favori — ajoutez des produits depuis leur fiche.
          </Text>
        )
      }
      renderItem={({ item }) => (
        <View className="flex-row items-center rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
          <View className="flex-1">
            <Text className="font-semibold" numberOfLines={2}>
              {item.product?.name ?? item.productId.slice(0, 8)}
            </Text>
            {item.product?.basePrice != null && (
              <Text className="text-sm font-bold text-primary">{formatPrice(item.product.basePrice)}</Text>
            )}
          </View>
          <Pressable
            className="rounded-lg bg-danger px-3 py-1.5"
            onPress={() => {
              Alert.alert('Favoris', 'Retirer ce produit de vos favoris ?', [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Retirer',
                  style: 'destructive',
                  onPress: () => {
                    void wishlistApi.remove(item.productId).then(() =>
                      qc.invalidateQueries({ queryKey: ['wishlist'] }),
                    );
                  },
                },
              ]);
            }}
          >
            <Text className="text-xs font-semibold text-white">Retirer</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ShoppingCart } from 'lucide-react-native';
import {
  useAuthStore,
} from '../../src/store/auth.store';
import {
  useCartStore, selectCount, selectSubtotal, selectServerItems,
} from '../../src/store/cart.store';
import { formatPrice } from '@autoparts/utils';
import { EmptyState } from '../../src/components/ui/EmptyState';

export default function PanierScreen() {
  const { isAuthenticated } = useAuthStore();
  const guestItems = useCartStore((s) => s.guestItems);
  const serverItems = useCartStore(selectServerItems);
  const count = useCartStore(selectCount);
  const subtotal = useCartStore(selectSubtotal);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const items = isAuthenticated
    ? serverItems.map((i) => ({
        key: i.id,
        variantId: i.variantId,
        name: i.productName ?? i.variantSku ?? 'Article',
        quantity: i.quantity,
        unitPrice: i.currentPrice,
      }))
    : guestItems.map((i) => ({
        key: i.variantId,
        variantId: i.variantId,
        name: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      }));

  if (items.length === 0) {
    return (
      <View className="flex-1 bg-slate-50 dark:bg-slate-900">
        <EmptyState
          icon={ShoppingCart}
          title="Votre panier est vide"
          body="Parcourez le catalogue ou scannez une référence OEM pour ajouter des pièces."
          actionLabel="Voir le catalogue"
          onAction={() => router.push('/(tabs)')}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900">
      <FlatList
        contentContainerClassName="p-3 gap-2"
        data={items}
        keyExtractor={(i) => i.key}
        renderItem={({ item }) => (
          <View className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
            <Text className="font-semibold" numberOfLines={2}>{item.name}</Text>
            <View className="mt-2 flex-row items-center justify-between">
              <View className="flex-row items-center rounded-lg border border-slate-200 dark:border-slate-600">
                <Pressable
                  className="px-3 py-1"
                  onPress={() => {
                    void updateQuantity(item.key, Math.max(1, item.quantity - 1)).catch((e: Error) =>
                      Alert.alert('Stock', e.message),
                    );
                  }}
                >
                  <Text className="text-lg">−</Text>
                </Pressable>
                <Text className="w-8 text-center">{item.quantity}</Text>
                <Pressable
                  className="px-3 py-1"
                  onPress={() => {
                    void updateQuantity(item.key, item.quantity + 1).catch((e: Error) =>
                      Alert.alert('Stock', e.message),
                    );
                  }}
                >
                  <Text className="text-lg">+</Text>
                </Pressable>
              </View>
              <Text className="font-bold text-primary">{formatPrice(item.unitPrice * item.quantity)}</Text>
              <Pressable onPress={() => void removeItem(item.key)}>
                <Text className="text-xs text-danger">Retirer</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <View className="border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <View className="mb-2 flex-row justify-between">
          <Text>Sous-total ({count})</Text>
          <Text className="font-bold">{formatPrice(subtotal)}</Text>
        </View>
        <Text className="mb-2 text-[10px] text-slate-400">TVA 19,25% et livraison calculées au checkout.</Text>
        <Pressable
          className="rounded-lg bg-accent py-3"
          onPress={() => {
            if (!isAuthenticated) {
              router.push('/(auth)/login');
              return;
            }
            router.push('/checkout');
          }}
        >
          <Text className="text-center font-semibold text-white">Passer commande</Text>
        </Pressable>
      </View>
    </View>
  );
}

import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react-native';
import { productsApi, reviewsApi } from '@autoparts/api';
import { formatDate, formatPrice } from '@autoparts/utils';
import { toast } from 'sonner-native';
import { useCartStore } from '../../src/store/cart.store';
import { useAuthStore } from '../../src/store/auth.store';

const CONDITION_LABELS: Record<string, string> = {
  new: 'Neuf', genuine_used: 'Occasion certifiée', reconditioned: 'Reconditionné',
};

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View className="flex-row gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          color={n <= value ? '#E07B00' : '#CBD5E1'}
          fill={n <= value ? '#E07B00' : 'transparent'}
        />
      ))}
    </View>
  );
}

export default function ProduitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const addItem = useCartStore((s) => s.addItem);
  const { user, isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(1);
  const [variantIndex, setVariantIndex] = useState(0);
  const [myRating, setMyRating] = useState(0);
  const [comment, setComment] = useState('');

  const { data: product, isLoading } = useQuery({
    queryKey: ['products', id],
    queryFn: () => productsApi.byId(id!),
    enabled: Boolean(id),
  });

  const { data: rating } = useQuery({
    queryKey: ['reviews', 'rating', id],
    queryFn: () => reviewsApi.productRating(id!),
    enabled: Boolean(id),
  });

  const { data: reviewsData, isLoading: reviewsLoading } = useQuery({
    queryKey: ['reviews', 'list', id],
    queryFn: () => reviewsApi.list({ productId: id!, limit: 10 }),
    enabled: Boolean(id),
  });
  const reviews = reviewsData?.items ?? [];

  const submitReview = useMutation({
    mutationFn: () =>
      reviewsApi.create({ productId: id!, rating: myRating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      setMyRating(0);
      setComment('');
      toast.success('Merci ! Votre avis a été soumis.');
      void queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Impossible d'envoyer l'avis"),
  });

  if (isLoading || !product) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Text className="text-sm text-slate-400">Chargement…</Text>
      </View>
    );
  }

  const variants = product.variants ?? [];
  const variant = variants[variantIndex] ?? variants[0];
  const price = Number(variant?.priceOverride ?? product.basePrice);

  const addToCart = async () => {
    if (!variant) return;
    try {
      await addItem(
        {
          variantId: variant.id,
          productName: product.name,
          variantSku: variant.variantSku,
          image: product.images?.[0]?.url ?? null,
          unitPrice: price,
        },
        quantity,
      );
      Alert.alert('Ajouté au panier', product.name, [
        { text: 'Continuer', style: 'cancel' },
        { text: 'Voir le panier', onPress: () => router.push('/(tabs)/panier') },
      ]);
    } catch (e) {
      Alert.alert('Erreur', (e as Error).message);
    }
  };

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-900" contentContainerClassName="p-4 gap-4">
      <View className="h-44 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700">
        <Text className="text-5xl">🔧</Text>
      </View>

      <View className="gap-2">
        <View className="flex-row gap-2">
          <Text className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
            {CONDITION_LABELS[product.condition] ?? product.condition}
          </Text>
          {product.brand?.name ? (
            <Text className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{product.brand.name}</Text>
          ) : null}
        </View>
        <Text className="text-xl font-bold">{product.name}</Text>
        {rating && rating.count > 0 ? (
          <View className="flex-row items-center gap-1.5">
            <Stars value={Math.round(rating.average)} />
            <Text className="text-xs text-slate-500">
              {rating.average.toFixed(1)} · {rating.count} avis
            </Text>
          </View>
        ) : (
          <Text className="text-xs text-slate-400">Aucun avis pour le moment</Text>
        )}
        <Text className="text-xs text-slate-400">SKU : {variant?.variantSku ?? product.sku}{product.oemReference ? ` · OEM ${product.oemReference}` : ''}</Text>
        <Text className="text-2xl font-extrabold text-primary">{formatPrice(price)}</Text>
        {product.description ? (
          <Text className="text-sm text-slate-600 dark:text-slate-300">{product.description}</Text>
        ) : null}
      </View>

      {variants.length > 1 && (
        <View className="gap-2">
          <Text className="text-sm font-semibold">Variantes</Text>
          <View className="flex-row flex-wrap gap-2">
            {variants.map((v, i) => (
              <Pressable
                key={v.id}
                className={`rounded-lg border px-3 py-1.5 ${i === variantIndex ? 'border-primary bg-primary/10' : 'border-slate-300 dark:border-slate-600'}`}
                onPress={() => setVariantIndex(i)}
              >
                <Text className="text-xs">{Object.values(v.attributes ?? {}).join(' · ') || v.variantSku}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {(product.compatibilities?.length ?? 0) > 0 && (
        <View className="gap-1">
          <Text className="text-sm font-semibold">Compatibilité véhicule</Text>
          {product.compatibilities!.slice(0, 8).map((c, i) => (
            <Text key={c.id ?? i} className="text-xs text-slate-500">
              {c.make} {c.model} ({c.yearStart ?? '?'}–{c.yearEnd ?? '?'})
            </Text>
          ))}
        </View>
      )}

      <View className="flex-row items-center gap-3">
        <View className="flex-row items-center rounded-lg border border-slate-300 dark:border-slate-600">
          <Pressable className="px-4 py-2" onPress={() => setQuantity((q) => Math.max(1, q - 1))}>
            <Text className="text-lg">−</Text>
          </Pressable>
          <Text className="w-8 text-center font-semibold">{quantity}</Text>
          <Pressable className="px-4 py-2" onPress={() => setQuantity((q) => q + 1)}>
            <Text className="text-lg">+</Text>
          </Pressable>
        </View>
        <Pressable className="flex-1 rounded-lg bg-accent py-3" onPress={addToCart}>
          <Text className="text-center font-semibold text-white">Ajouter au panier</Text>
        </Pressable>
      </View>

      <View className="gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <Text className="text-sm font-semibold">Avis clients</Text>

        {isAuthenticated ? (
          <View className="gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
            <Text className="text-xs font-semibold">Laisser un avis</Text>
            <View className="flex-row gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setMyRating(n)} className="p-0.5">
                  <Star
                    size={26}
                    color={n <= myRating ? '#E07B00' : '#CBD5E1'}
                    fill={n <= myRating ? '#E07B00' : 'transparent'}
                  />
                </Pressable>
              ))}
            </View>
            <TextInput
              className="min-h-[64px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Votre commentaire (facultatif)…"
              multiline
              textAlignVertical="top"
              value={comment}
              onChangeText={setComment}
            />
            <Pressable
              className={`rounded-lg bg-primary py-2.5 ${myRating === 0 || submitReview.isPending ? 'opacity-50' : ''}`}
              disabled={myRating === 0 || submitReview.isPending}
              onPress={() => submitReview.mutate()}
            >
              <Text className="text-center text-sm font-semibold text-white">
                {submitReview.isPending ? 'Envoi…' : 'Publier mon avis'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable className="self-start" onPress={() => router.push('/(auth)/login')}>
            <Text className="text-xs text-primary underline">Connectez-vous pour laisser un avis</Text>
          </Pressable>
        )}

        {reviewsLoading ? (
          <Text className="text-xs text-slate-400">Chargement des avis…</Text>
        ) : reviews.length === 0 ? (
          <Text className="text-xs text-slate-400">Soyez le premier à donner votre avis.</Text>
        ) : (
          <View className="gap-3">
            {reviews.map((r) => (
              <View key={r.id} className="gap-1 border-b border-slate-100 pb-3 last:border-0 dark:border-slate-700">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-semibold">
                    {r.user ? `${r.user.firstName} ${(r.user.lastName ?? '').slice(0, 1)}.` : 'Client'}
                  </Text>
                  <Text className="text-[10px] text-slate-400">
                    {r.createdAt ? formatDate(r.createdAt) : ''}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Stars value={r.rating} />
                  {r.isVerifiedPurchase ? (
                    <Text className="rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-bold text-success">
                      Achat vérifié
                    </Text>
                  ) : null}
                </View>
                {r.comment ? (
                  <Text className="text-xs text-slate-600 dark:text-slate-300">{r.comment}</Text>
                ) : null}
                {r.sellerReply ? (
                  <View className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900">
                    <Text className="text-[10px] font-bold text-slate-400">Réponse du vendeur</Text>
                    <Text className="text-xs text-slate-600 dark:text-slate-300">{r.sellerReply}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

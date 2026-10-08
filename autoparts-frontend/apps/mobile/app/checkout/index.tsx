import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { addressesApi, ordersApi, paymentsApi, promotionsApi, shippingApi } from '@autoparts/api';
import { formatPrice } from '@autoparts/utils';
import { useCartStore, selectCount, selectSubtotal, selectServerItems } from '../../src/store/cart.store';
import type { MomoProvider } from '@autoparts/types';

/** Extrait le frais de livraison d'une réponse de /shipping/quote au format souple. */
function pickFee(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const key of ['fee', 'cost', 'shippingFee', 'amount', 'price', 'total']) {
      const v = o[key];
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))) return Number(v);
    }
  }
  return 0;
}

export default function CheckoutScreen() {
  const count = useCartStore(selectCount);
  const subtotal = useCartStore(selectSubtotal);
  const serverItems = useCartStore(selectServerItems);
  const fetchCart = useCartStore((s) => s.fetchServerCart);

  const [addressId, setAddressId] = useState('');
  const [provider, setProvider] = useState<MomoProvider>('mtn');
  const [phone, setPhone] = useState('');
  const [waiting, setWaiting] = useState(false);

  // Code promo
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<{ discount: number; message: string } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);

  // Livraison
  const [zoneId, setZoneId] = useState('');

  const { data: addresses = [] } = useQuery({
    queryKey: ['addresses'],
    queryFn: addressesApi.list,
  });

  const { data: zones = [] } = useQuery({
    queryKey: ['shipping', 'zones'],
    queryFn: shippingApi.zones,
  });

  const { data: quote } = useQuery({
    queryKey: ['shipping', 'quote', zoneId, subtotal],
    queryFn: () => shippingApi.quote({ zoneId, subtotal }),
    enabled: Boolean(zoneId),
  });
  const shippingFee = zoneId ? pickFee(quote) : 0;
  const promoDiscount = Math.min(promo?.discount ?? 0, subtotal);
  const total = Math.max(0, subtotal + shippingFee - promoDiscount);

  const applyPromo = async () => {
    const code = promoInput.trim();
    if (!code || promoChecking) return;
    setPromoChecking(true);
    setPromo(null);
    try {
      const res = (await promotionsApi.validate({ code, orderAmount: subtotal })) as {
        valid?: boolean;
        discount?: number | string;
        message?: string;
      };
      const discount = Number(res.discount ?? 0);
      if (res.valid === false) {
        setPromo({ discount: 0, message: res.message ?? 'Code invalide ou expiré' });
      } else {
        setPromo({
          discount,
          message: res.message ?? (discount > 0 ? `Code appliqué : −${formatPrice(discount)}` : 'Code appliqué'),
        });
      }
    } catch (e) {
      setPromo({ discount: 0, message: (e as Error).message ?? 'Code invalide' });
    } finally {
      setPromoChecking(false);
    }
  };

  const submit = useMutation({
    mutationFn: async () => {
      const order = await ordersApi.create({
        channel: 'b2c',
        shippingAddressId: addressId,
        lines: serverItems.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        currency: 'XAF',
      });
      const payment = await paymentsApi.create({
        orderId: order.id,
        method: 'mobile_money',
        provider,
        phone,
      });
      // Polling du statut (push USSD envoyé sur le téléphone)
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await paymentsApi.status(payment.id);
        if (st.status === 'completed') return order;
        if (st.status === 'failed') throw new Error('Paiement échoué ou expiré');
      }
      throw new Error('Paiement non confirmé après 2 minutes');
    },
    onSuccess: () => {
      void fetchCart();
      Alert.alert('Commande enregistrée', 'Vous recevrez un email de confirmation.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/commandes') },
      ]);
    },
    onError: (e: Error) => {
      setWaiting(false);
      Alert.alert('Paiement', e.message);
    },
  });

  const startPayment = () => {
    if (!addressId) {
      Alert.alert('Adresse', 'Choisissez une adresse de livraison');
      return;
    }
    if (phone.length < 9) {
      Alert.alert('Téléphone', 'Saisissez votre numéro Mobile Money');
      return;
    }
    setWaiting(true);
    submit.mutate();
  };

  if (waiting) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6 dark:bg-slate-900">
        <Text className="text-lg font-bold">Confirmez sur votre téléphone…</Text>
        <Text className="mt-2 text-center text-sm text-slate-500">
          Une demande de paiement {provider === 'mtn' ? 'MTN MoMo' : 'Orange Money'} a été envoyée au
          {' '}{phone}. Validez avec votre code secret (2 min max).
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-900" contentContainerClassName="p-4 gap-4">
      <View className="gap-2">
        <Text className="text-sm font-semibold">1. Adresse de livraison</Text>
        {addresses.map((a) => (
          <Pressable
            key={a.id}
            className={`rounded-lg border p-3 ${addressId === a.id ? 'border-primary bg-primary/10' : 'border-slate-200 dark:border-slate-600'}`}
            onPress={() => setAddressId(a.id)}
          >
            <Text className="text-sm font-medium">{a.label}</Text>
            <Text className="text-xs text-slate-400">{a.street}, {a.city}</Text>
          </Pressable>
        ))}
        {addresses.length === 0 && (
          <Text className="text-xs text-slate-400">Aucune adresse enregistrée sur votre compte web.</Text>
        )}
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold">2. Code promo</Text>
        <View className="flex-row gap-2">
          <TextInput
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm uppercase dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            placeholder="AUTO10, LIVRAISONGRATUITE…"
            autoCapitalize="characters"
            value={promoInput}
            onChangeText={setPromoInput}
          />
          <Pressable
            className="rounded-lg bg-slate-800 px-4 py-2.5 dark:bg-slate-700"
            disabled={promoChecking}
            onPress={applyPromo}
          >
            <Text className="text-sm font-semibold text-white">{promoChecking ? '…' : 'Appliquer'}</Text>
          </Pressable>
        </View>
        {promo ? (
          <Text className={`text-xs ${promo.discount > 0 ? 'text-success' : 'text-danger'}`}>{promo.message}</Text>
        ) : (
          <Text className="text-[11px] text-slate-400">Les promotions actives sont visibles dans l'onglet Compte.</Text>
        )}
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold">3. Livraison</Text>
        {zones.length === 0 ? (
          <Text className="text-xs text-slate-400">Zones de livraison en cours de configuration.</Text>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {zones.map((z) => (
              <Pressable
                key={z.id}
                className={`rounded-lg border px-3 py-2 ${zoneId === z.id ? 'border-primary bg-primary/10' : 'border-slate-300 dark:border-slate-600'}`}
                onPress={() => setZoneId(z.id)}
              >
                <Text className={`text-xs ${zoneId === z.id ? 'font-semibold text-primary' : ''}`}>
                  {z.name}
                  {z.baseFee ? ` · ${formatPrice(Number(z.baseFee))}` : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {zoneId ? (
          <Text className="text-xs text-slate-500">
            Frais estimés : {shippingFee > 0 ? formatPrice(shippingFee) : 'offerte'}
            {subtotal > 0 && shippingFee === 0 ? ' (seuil atteint ou zone gratuite)' : ''}
          </Text>
        ) : null}
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold">4. Paiement Mobile Money</Text>
        <View className="flex-row gap-2">
          {(['mtn', 'orange'] as MomoProvider[]).map((p) => (
            <Pressable
              key={p}
              className={`flex-1 rounded-lg border py-2 ${provider === p ? 'border-primary bg-primary/10' : 'border-slate-300 dark:border-slate-600'}`}
              onPress={() => setProvider(p)}
            >
              <Text className={`text-center text-sm font-semibold ${provider === p ? 'text-primary' : 'text-slate-500'}`}>
                {p === 'mtn' ? 'MTN MoMo' : 'Orange Money'}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          placeholder="+237 6XX XXX XXX"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
      </View>

      <View className="gap-1 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <View className="flex-row justify-between">
          <Text>Sous-total ({count})</Text>
          <Text>{formatPrice(subtotal)}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text>Livraison</Text>
          <Text>{zoneId ? (shippingFee > 0 ? formatPrice(shippingFee) : 'Offerte') : '—'}</Text>
        </View>
        {promoDiscount > 0 ? (
          <View className="flex-row justify-between">
            <Text>Remise</Text>
            <Text className="text-success">−{formatPrice(promoDiscount)}</Text>
          </View>
        ) : null}
        <View className="mt-1 flex-row justify-between border-t border-slate-100 pt-2 dark:border-slate-700">
          <Text className="font-bold">Total</Text>
          <Text className="font-bold text-primary">{formatPrice(total)}</Text>
        </View>
        <Text className="text-[10px] text-slate-400">TVA 19,25% incluse</Text>
      </View>

      <Pressable
        className="rounded-lg bg-accent py-3 disabled:opacity-50"
        disabled={submit.isPending}
        onPress={startPayment}
      >
        <Text className="text-center font-semibold text-white">Payer {formatPrice(total)}</Text>
      </Pressable>
    </ScrollView>
  );
}

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Wallet as WalletIcon } from 'lucide-react-native';
import { toast } from 'sonner-native';
import { walletApi } from '@autoparts/api';
import { formatPrice, formatDateTime } from '@autoparts/utils';
import { useAuthStore } from '../src/store/auth.store';
import { TextField } from '../src/components/ui/TextField';
import { Button } from '../src/components/ui/Button';

type Mode = 'deposit' | 'withdraw';

export default function WalletScreen() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('deposit');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [provider, setProvider] = useState<'mtn' | 'orange'>('mtn');

  const { data: wallet } = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: walletApi.balance,
    enabled: isAuthenticated,
  });
  const { data: history = [] } = useQuery({
    queryKey: ['wallet', 'history'],
    queryFn: walletApi.history,
    enabled: isAuthenticated,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!value || value <= 0) throw new Error('Montant invalide');
      if (mode === 'deposit') {
        return walletApi.recharge({ amount: value, phone: phone.trim(), provider });
      }
      if (value > (wallet?.balance ?? 0)) throw new Error('Solde insuffisant');
      return walletApi.withdraw({ amount: value, phone: phone.trim() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      toast.success(
        mode === 'deposit'
          ? 'Recharge initiée — validez sur votre téléphone'
          : 'Demande de retrait enregistrée — traitement sous 24 h',
      );
      setAmount('');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Opération impossible'),
  });

  if (!isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6 dark:bg-slate-900">
        <Text className="mb-3 text-center text-sm text-slate-500">Connectez-vous pour accéder à votre wallet.</Text>
        <Pressable className="rounded-full bg-primary px-5 py-2.5" onPress={() => router.push('/(auth)/login')}>
          <Text className="font-semibold text-white">Se connecter</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      contentContainerClassName="gap-4 p-6 pb-24"
    >
      {/* Solde */}
      <View className="items-center gap-1 rounded-[20px] border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <WalletIcon size={22} color="#C92F3E" />
        <Text className="mt-1 text-[10px] uppercase tracking-[1.1px] text-slate-400">Solde disponible</Text>
        <Text className="text-[28px] font-bold tracking-[-0.5px] text-slate-900 dark:text-slate-50">
          {wallet ? formatPrice(wallet.balance) : '—'}
        </Text>
      </View>

      {/* Segmented dépôt / retrait */}
      <View className="flex-row gap-2">
        {(
          [
            { value: 'deposit', label: 'Déposer', icon: ArrowDownToLine },
            { value: 'withdraw', label: 'Retirer', icon: ArrowUpFromLine },
          ] as const
        ).map((m) => {
          const active = mode === m.value;
          const Icon = m.icon;
          return (
            <Pressable
              key={m.value}
              onPress={() => setMode(m.value)}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-full border py-2.5 ${
                active
                  ? 'border-primary bg-primary/10'
                  : 'border-slate-300 dark:border-slate-600'
              }`}
            >
              <Icon size={16} color={active ? '#C92F3E' : '#97A0AC'} />
              <Text className={`text-sm ${active ? 'font-bold text-primary' : 'text-slate-400'}`}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Formulaire */}
      <View className="gap-2 rounded-[20px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <TextField
          label={mode === 'deposit' ? 'Montant à déposer (XAF)' : 'Montant à retirer (XAF)'}
          placeholder="ex. 5000"
          keyboardType="number-pad"
          value={amount}
          onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
        />
        {mode === 'deposit' ? (
          <View className="mb-3 flex-row gap-2">
            {(['mtn', 'orange'] as const).map((p) => (
              <Pressable
                key={p}
                className={`flex-1 rounded-full border py-2 ${provider === p ? 'border-primary bg-primary/10' : 'border-slate-300 dark:border-slate-600'}`}
                onPress={() => setProvider(p)}
              >
                <Text className={`text-center text-xs font-semibold ${provider === p ? 'text-primary' : 'text-slate-400'}`}>
                  {p === 'mtn' ? 'MTN MoMo' : 'Orange Money'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <TextField
          label="Numéro Mobile Money"
          placeholder="+237 6XX XXX XXX"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <Button
          label={
            submit.isPending
              ? 'Traitement…'
              : mode === 'deposit'
                ? `Déposer ${amount ? formatPrice(Number(amount)) : ''}`.trim()
                : `Retirer ${amount ? formatPrice(Number(amount)) : ''}`.trim()
          }
          disabled={submit.isPending || !amount || phone.trim().length < 8}
          onPress={() => submit.mutate()}
        />
        <Text className="text-center text-[11px] text-slate-400">
          {mode === 'deposit'
            ? 'Crédité après validation du paiement sur votre téléphone.'
            : 'Débité immédiatement — versement Mobile Money sous 24 h après validation.'}
        </Text>
      </View>

      {/* Historique */}
      <Text className="mt-2 text-[11.5px] font-medium uppercase tracking-[1.4px] text-slate-400">
        Historique
      </Text>
      <View className="overflow-hidden rounded-[20px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        {history.length === 0 ? (
          <Text className="p-4 text-center text-sm text-slate-400">Aucune opération pour le moment.</Text>
        ) : (
          history.slice(0, 20).map((t, i) => (
            <View
              key={t.id}
              className={`flex-row items-center justify-between p-3.5 ${
                i < Math.min(history.length, 20) - 1 ? 'border-b border-slate-100 dark:border-slate-700' : ''
              }`}
            >
              <View className="flex-1">
                <Text className="text-sm font-semibold capitalize text-slate-900 dark:text-slate-50">
                  {t.type === 'credit' ? 'Crédit' : t.type === 'debit' ? 'Débit' : t.type}
                </Text>
                <Text className="text-xs text-slate-400" numberOfLines={1}>
                  {t.description ?? '—'}
                </Text>
                {t.createdAt ? (
                  <Text className="text-[10px] text-slate-400">{formatDateTime(t.createdAt)}</Text>
                ) : null}
              </View>
              <Text
                className={`text-sm font-bold ${t.type === 'credit' || t.type === 'refund' ? 'text-success' : 'text-primary'}`}
              >
                {t.type === 'credit' || t.type === 'refund' ? '+' : '−'}
                {formatPrice(t.amount)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { toast } from 'sonner-native';
import { ShieldCheck } from 'lucide-react-native';
import { useAuthStore } from '../../src/store/auth.store';
import { TextField } from '../../src/components/ui/TextField';
import { Button } from '../../src/components/ui/Button';

export default function OtpScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { user, isAuthenticated, verifyOtp, resendOtp } = useAuthStore();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async () => {
    if (!isAuthenticated) {
      toast.error('Session introuvable — reconnectez-vous');
      router.replace('/(auth)/login');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(code);
      toast.success('Email vérifié — compte actif !');
      router.replace('/(tabs)');
    } catch (e) {
      toast.error((e as Error).message ?? 'Code invalide');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      await resendOtp();
      setCooldown(60);
      toast.success('Nouveau code envoyé');
    } catch (e) {
      toast.error((e as Error).message ?? 'Renvoi impossible');
    }
  };

  return (
    <View className="flex-1 justify-center bg-slate-50 px-6 dark:bg-slate-900">
      <View className="mb-6 h-16 w-16 items-center justify-center rounded-[20px] border border-slate-200 bg-slate-100/70 self-center dark:border-slate-700 dark:bg-slate-800/60">
        <ShieldCheck size={30} color="#1A4D8F" />
      </View>
      <Text className="mb-1 text-center text-[25px] font-bold tracking-[-0.3px] text-slate-900 dark:text-slate-50">
        Vérification email
      </Text>
      <Text className="mb-8 text-center text-sm text-slate-500">
        Code à 6 chiffres envoyé à {params.email ?? user?.email ?? 'votre adresse'} (valable 10 min)
      </Text>

      <TextField
        label="Code de vérification"
        icon={ShieldCheck}
        placeholder="000000"
        keyboardType="number-pad"
        maxLength={6}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
      />

      <Button label={loading ? 'Vérification…' : 'Vérifier mon email'} disabled={loading || code.length < 6} onPress={verify} />

      <Pressable
        className="mt-4 self-center disabled:opacity-40"
        disabled={cooldown > 0}
        onPress={resend}
      >
        <Text className="text-sm text-slate-500">
          {cooldown > 0 ? `Renvoyer le code dans ${cooldown}s` : 'Renvoyer le code'}
        </Text>
      </Pressable>
    </View>
  );
}

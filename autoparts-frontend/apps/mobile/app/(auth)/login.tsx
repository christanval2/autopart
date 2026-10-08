import { useState } from 'react';
import { Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { toast } from 'sonner-native';
import { Lock, Mail } from 'lucide-react-native';
import { authApi } from '@autoparts/api';
import { useAuthStore } from '../../src/store/auth.store';
import { useCartStore } from '../../src/store/cart.store';
import { useGoogleSignIn } from '../../src/lib/useGoogleSignIn';
import { TextField } from '../../src/components/ui/TextField';
import { Button } from '../../src/components/ui/Button';

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const sync = useCartStore((s) => s.syncAfterLogin);
  const google = useGoogleSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await login({ email: email.trim(), password });
      await sync();
      toast.success(`Bienvenue ${user.firstName} !`);
      router.replace('/(tabs)');
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      if (err.statusCode === 403) {
        router.push({ pathname: '/(auth)/otp', params: { email } });
        return;
      }
      setError(err.message ?? 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 justify-center bg-slate-50 px-6 dark:bg-slate-900">
      <Text className="mb-1 text-center text-[28px] font-bold tracking-[-0.5px] text-primary">
        AutoParts Cameroun
      </Text>
      <Text className="mb-8 text-center text-sm text-slate-500">
        La bonne pièce auto, partout au Cameroun
      </Text>

      <TextField
        label="Email"
        icon={Mail}
        placeholder="vous@exemple.cm"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextField
        label="Mot de passe"
        icon={Lock}
        placeholder="••••••••"
        secure
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text className="mb-3 -mt-1 text-xs font-medium text-danger">{error}</Text>}

      <Button
        label={loading ? 'Connexion…' : 'Se connecter'}
        disabled={loading || !email || !password}
        onPress={submit}
      />

      <View className="my-5 flex-row items-center gap-3">
        <View className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <Text className="text-xs text-slate-400">ou</Text>
        <View className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </View>

      <Button
        label="Continuer avec Google"
        variant="outline"
        disabled={!google.configured}
        onPress={google.start}
      />
      {!google.configured && (
        <Text className="mt-2 text-center text-[10px] text-slate-400">
          Google non configuré — renseignez EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB (web) / _ANDROID / _IOS (natif) dans le .env.
        </Text>
      )}

      <View className="mt-6 flex-row justify-center">
        <Text className="text-sm text-slate-500">Pas de compte ? </Text>
        <Link href="/(auth)/register">
          <Text className="font-semibold text-primary">Créer un compte</Text>
        </Link>
      </View>
    </View>
  );
}

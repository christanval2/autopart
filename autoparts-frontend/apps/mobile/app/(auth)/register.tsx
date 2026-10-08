import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { toast } from 'sonner-native';
import { Building2, Mail, User as UserIcon } from 'lucide-react-native';
import { authApi } from '@autoparts/api';
import { useAuthStore } from '../../src/store/auth.store';
import { useCartStore } from '../../src/store/cart.store';
import { TextField } from '../../src/components/ui/TextField';
import { Button } from '../../src/components/ui/Button';

export default function RegisterScreen() {
  const register = useAuthStore((s) => s.register);
  const sync = useCartStore((s) => s.syncAfterLogin);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', accountType: 'individual' as 'individual' | 'pro', orgName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await register({
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        accountType: form.accountType,
        orgName: form.accountType === 'pro' ? form.orgName : undefined,
      });
      await sync();
      toast.success('Compte créé — saisissez le code reçu par email');
      router.push({ pathname: '/(auth)/otp', params: { email: form.email } });
    } catch (e) {
      setError((e as Error).message ?? 'Inscription impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-10 bg-slate-50 dark:bg-slate-900">
      <Text className="mb-6 text-center text-[28px] font-bold tracking-[-0.5px] text-primary">
        Créer un compte
      </Text>

      <View className="mb-4 flex-row gap-2">
        {(['individual', 'pro'] as const).map((t) => (
          <Pressable
            key={t}
            className={`flex-1 rounded-full border py-2.5 ${form.accountType === t ? 'border-primary bg-primary/10' : 'border-slate-300 dark:border-slate-600'}`}
            onPress={() => setForm({ ...form, accountType: t })}
          >
            <Text className={`text-center text-sm ${form.accountType === t ? 'font-bold text-primary' : 'text-slate-500'}`}>
              {t === 'individual' ? 'Particulier' : 'Pro'}
            </Text>
          </Pressable>
        ))}
      </View>

      {form.accountType === 'pro' && (
        <TextField
          label="Nom de l'organisation"
          icon={Building2}
          placeholder="Garage, flotte, entreprise…"
          value={form.orgName}
          onChangeText={(v) => setForm({ ...form, orgName: v })}
        />
      )}

      <View className="flex-row gap-2">
        <View className="flex-1">
          <TextField
            label="Prénom"
            icon={UserIcon}
            value={form.firstName}
            onChangeText={(v) => setForm({ ...form, firstName: v })}
          />
        </View>
        <View className="flex-1">
          <TextField
            label="Nom"
            value={form.lastName}
            onChangeText={(v) => setForm({ ...form, lastName: v })}
          />
        </View>
      </View>
      <TextField
        label="Email"
        icon={Mail}
        placeholder="vous@exemple.cm"
        autoCapitalize="none"
        keyboardType="email-address"
        value={form.email}
        onChangeText={(v) => setForm({ ...form, email: v })}
      />
      <TextField
        label="Mot de passe"
        placeholder="8 car., 1 majuscule, 1 chiffre"
        secure
        value={form.password}
        onChangeText={(v) => setForm({ ...form, password: v })}
      />
      {error && <Text className="-mt-1 mb-3 text-xs font-medium text-danger">{error}</Text>}

      <Button
        label={loading ? 'Création…' : 'Créer mon compte'}
        disabled={loading || !form.email || !form.password || !form.firstName || !form.lastName}
        onPress={submit}
      />

      <View className="mt-6 flex-row justify-center">
        <Text className="text-sm text-slate-500">Déjà inscrit ? </Text>
        <Link href="/(auth)/login">
          <Text className="font-semibold text-primary">Se connecter</Text>
        </Link>
      </View>
    </ScrollView>
  );
}

import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner-native';
import { Phone, User as UserIcon } from 'lucide-react-native';
import { usersApi } from '@autoparts/api';
import { useAuthStore } from '../../src/store/auth.store';
import { TextField } from '../../src/components/ui/TextField';
import { Button } from '../../src/components/ui/Button';

export default function ModifierProfilScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');

  // Pré-remplit si le user arrive hydraté après le montage.
  useEffect(() => {
    if (user?.firstName) setFirstName((v) => v || user.firstName);
    if (user?.lastName) setLastName((v) => v || user.lastName);
    if (user?.phone) setPhone((v) => v || user.phone);
  }, [user]);

  const save = useMutation({
    mutationFn: () =>
      usersApi.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      toast.success('Profil mis à jour');
      router.back();
    },
    onError: (e: Error) => toast.error(e.message ?? 'Mise à jour impossible'),
  });

  const dirty =
    firstName.trim() !== (user?.firstName ?? '') ||
    lastName.trim() !== (user?.lastName ?? '') ||
    phone.trim() !== (user?.phone ?? '');

  return (
    <ScrollView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      contentContainerClassName="gap-4 p-6 pb-24"
    >
      <Text className="text-[11.5px] font-medium uppercase tracking-[1.4px] text-slate-400">
        Identité
      </Text>
      <View className="gap-2 rounded-[20px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <View className="flex-row gap-2">
          <View className="flex-1">
            <TextField label="Prénom" icon={UserIcon} value={firstName} onChangeText={setFirstName} />
          </View>
          <View className="flex-1">
            <TextField label="Nom" value={lastName} onChangeText={setLastName} />
          </View>
        </View>
        <TextField
          label="Téléphone"
          icon={Phone}
          placeholder="+237 6XX XXX XXX"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <Text className="-mt-1 text-xs text-slate-400">{user?.email} (l'email ne se modifie pas)</Text>
      </View>

      <Button
        label={save.isPending ? 'Enregistrement…' : 'Enregistrer les modifications'}
        disabled={save.isPending || !dirty || !firstName.trim() || !lastName.trim()}
        onPress={() => save.mutate()}
      />
    </ScrollView>
  );
}

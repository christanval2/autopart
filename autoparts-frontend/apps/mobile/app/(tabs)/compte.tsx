import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  Bot,
  Heart,
  HelpCircle,
  LogOut,
  MapPin,
  Mic,
  MessageCircle,
  MonitorSmartphone,
  Moon,
  Pencil,
  ShieldCheck,
  Star,
  Sun,
  Tag,
  UserCog,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { toast } from 'sonner-native';
import { walletApi, loyaltyApi } from '@autoparts/api';
import { formatPrice } from '@autoparts/utils';
import { useAuthStore } from '../../src/store/auth.store';
import { useCartStore } from '../../src/store/cart.store';
import { registerForPushNotifications } from '../../src/lib/push';
import { OptionRow } from '../../src/components/ui/OptionRow';
import { ThemeSegmented } from '../../src/components/ui/ThemeSegmented';
import {
  useAppTheme,
  type ThemePreference,
} from '../../src/theme/AppThemeProvider';

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: 'system', label: 'Auto', icon: MonitorSmartphone },
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2.5 ml-1 text-[11.5px] font-medium uppercase tracking-[1.4px] text-slate-400">
      {children}
    </Text>
  );
}

export default function CompteScreen() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const clearCart = useCartStore((s) => s.clear);
  const { preference, setPreference } = useAppTheme();

  const { data: wallet } = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: walletApi.balance,
    enabled: isAuthenticated,
  });
  const { data: loyalty } = useQuery({
    queryKey: ['loyalty', 'balance'],
    queryFn: loyaltyApi.balance,
    enabled: isAuthenticated,
  });

  const initials = `${user?.firstName?.charAt(0) ?? ''}${user?.lastName?.charAt(0) ?? ''}`.toUpperCase();

  // Le sélecteur de thème est disponible même sans compte (préférence cosmétique).
  const themeCard = (
    <View>
      <SectionLabel>Thème</SectionLabel>
      <View className="overflow-hidden rounded-[20px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <ThemeSegmented value={preference} onChange={setPreference} options={THEME_OPTIONS} />
      </View>
    </View>
  );

  if (!isAuthenticated) {
    return (
      <ScrollView
        className="flex-1 bg-slate-50 dark:bg-slate-900"
        contentContainerClassName="gap-4 p-6 pb-[150px]"
      >
        <Text className="text-[28px] font-bold tracking-[-0.5px] text-slate-900 dark:text-slate-50">
          Profil
        </Text>
        <View className="items-center gap-4 rounded-[20px] border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          <View className="h-[84px] w-[84px] items-center justify-center rounded-full border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-900">
            <Text className="text-[28px] font-bold tracking-[1px] text-slate-900 dark:text-slate-50">?</Text>
          </View>
          <Text className="text-center text-sm text-slate-500">
            Connectez-vous pour accéder à votre compte.
          </Text>
          <Pressable className="rounded-full bg-primary px-5 py-2.5" onPress={() => router.push('/(auth)/login')}>
            <Text className="font-semibold text-white">Se connecter</Text>
          </Pressable>
        </View>
        {themeCard}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      contentContainerClassName="p-6 pb-[150px]"
    >
      {/* ── Identité ── */}
      <View className="mb-7 items-center">
        <View className="h-[84px] w-[84px] items-center justify-center rounded-full border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-900">
          <Text className="text-[28px] font-bold tracking-[1px] text-slate-900 dark:text-slate-50">
            {initials || '?'}
          </Text>
        </View>
        <Text className="mt-3.5 text-[20px] font-bold tracking-[-0.3px] text-slate-900 dark:text-slate-50">
          {user?.firstName} {user?.lastName}
        </Text>
        <Text className="mt-1 text-sm text-slate-400">{user?.email}</Text>
        <Pressable
          className="mt-3.5 flex-row items-center gap-1.5 rounded-full border border-slate-300 px-3.5 py-2 dark:border-slate-600"
          onPress={() => router.push('/profil/modifier')}
        >
          <Pencil size={13} color="#5B616E" />
          <Text className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">
            Modifier le profil
          </Text>
        </Pressable>
      </View>

      {/* ── Wallet & fidélité ── */}
      <SectionLabel>Portefeuille</SectionLabel>
      <View className="mb-5 flex-row gap-3">
        <Pressable
          className="flex-1 rounded-[20px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
          onPress={() => router.push('/wallet')}
        >
          <Text className="text-[10px] uppercase tracking-[1.1px] text-slate-400">Wallet</Text>
          <Text className="mt-1 text-xl font-bold">{wallet ? formatPrice(wallet.balance) : '—'}</Text>
          <Text className="mt-0.5 text-[10px] text-primary">Déposer / Retirer →</Text>
        </Pressable>
        <View className="flex-1 rounded-[20px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <Text className="text-[10px] uppercase tracking-[1.1px] text-slate-400">Fidélité</Text>
          <Text className="mt-1 text-xl font-bold">{loyalty?.points ?? 0} pts</Text>
        </View>
      </View>

      {/* ── Thème ── */}
      {themeCard}

      {/* ── Services ── */}
      <View className="mt-5">
        <SectionLabel>Services & préférences</SectionLabel>
        <View className="overflow-hidden rounded-[20px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <OptionRow icon={Heart} label="Mes favoris" onPress={() => router.push('/favoris')} />
          <OptionRow
            icon={MapPin}
            label="Mes adresses de livraison"
            subtitle="Ajouter, modifier, définir par défaut"
            onPress={() => router.push('/adresses')}
          />
          <OptionRow icon={MessageCircle} label="Messages" onPress={() => router.push('/messages')} />
          <OptionRow icon={Tag} label="Promotions & codes promo" onPress={() => router.push('/promotions')} />
          <OptionRow
            icon={Bot}
            label="Assistant AutoBot"
            subtitle="Trouvez la bonne pièce en lui posant la question"
            onPress={() => router.push('/chatbot')}
          />
          <OptionRow
            icon={Mic}
            label="Commande vocale"
            subtitle="Parlez à AutoBot pour commander à la voix"
            onPress={() => router.push('/vocal')}
          />
          <OptionRow icon={Star} label="Suivi de colis" onPress={() => router.push('/suivi/AUTO')} />
          <OptionRow
            icon={BarChart3}
            label="Statistiques"
            subtitle="Ventes, revenus et conversion"
            onPress={() => router.push('/stats')}
            isLast
          />
        </View>
      </View>

      {/* ── Réglages ── */}
      <View className="mt-5">
        <SectionLabel>Réglages</SectionLabel>
        <View className="overflow-hidden rounded-[20px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <OptionRow
            icon={UserCog}
            label="Paramètres du compte"
            subtitle="Nom, téléphone"
            onPress={() => router.push('/profil/modifier')}
          />
          <OptionRow
            icon={Bell}
            label="Notifications"
            subtitle="Alertes commandes et promotions"
            onPress={async () => {
              const token = await registerForPushNotifications();
              if (token) toast.success('Notifications activées sur cet appareil');
              else toast.info('Push non disponible sur cet appareil — essayez sur mobile');
            }}
          />
          <OptionRow
            icon={ShieldCheck}
            label="Confidentialité"
            subtitle="Politique et données personnelles"
            badge="Bientôt"
            onPress={() => toast('Confidentialité — bientôt disponible')}
          />
          <OptionRow
            icon={HelpCircle}
            label="Aide & support"
            subtitle="AutoBot répond 24h/24"
            onPress={() => router.push('/chatbot')}
            isLast
          />
        </View>
      </View>

      {/* ── Déconnexion ── */}
      <View className="mt-5">
        <Pressable
          className="flex-row items-center justify-center gap-2 self-stretch rounded-full border border-slate-300 py-3.5 dark:border-slate-600"
          onPress={async () => {
            await logout();
            await clearCart();
            router.replace('/(tabs)');
          }}
        >
          <LogOut size={18} color="#5B616E" />
          <Text className="text-base font-semibold text-slate-500 dark:text-slate-300">
            Déconnexion
          </Text>
        </Pressable>
      </View>

      {/* ── Pied de marque ── */}
      <View className="mt-8 flex-row items-center justify-center gap-2 opacity-50">
        <View className="h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-primary">
          <Wrench size={13} color="#FFFFFF" />
        </View>
        <Text className="text-[13px] text-slate-400">AutoParts Cameroun · v1.0.0</Text>
      </View>
    </ScrollView>
  );
}

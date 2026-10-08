import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../global.css';
import { installSecureStorage } from '../src/lib/storage';
import { hydrateAuth } from '../src/store/auth.store';
import { hydrateCart } from '../src/store/cart.store';
import { AppThemeProvider } from '../src/theme/AppThemeProvider';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  useEffect(() => {
    installSecureStorage();
    void hydrateAuth().then(() => hydrateCart());
  }, []);

  return (
    <AppThemeProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerTitleStyle: { fontWeight: '700' } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="produits/[id]" options={{ title: 'Produit' }} />
          <Stack.Screen name="checkout/index" options={{ title: 'Commander' }} />
          <Stack.Screen name="messages/index" options={{ title: 'Messages' }} />
          <Stack.Screen name="messages/[id]" options={{ title: 'Conversation' }} />
          <Stack.Screen name="scanner/index" options={{ title: 'Scanner OEM' }} />
          <Stack.Screen name="suivi/[tracking]" options={{ title: 'Suivi colis' }} />
          <Stack.Screen name="favoris/index" options={{ title: 'Favoris' }} />
          <Stack.Screen name="chatbot/index" options={{ title: 'AutoBot' }} />
          <Stack.Screen name="vocal" options={{ title: 'Commande vocale' }} />
          <Stack.Screen name="promotions/index" options={{ title: 'Promotions' }} />
          <Stack.Screen name="litiges/nouveau" options={{ title: 'Signaler un litige' }} />
          <Stack.Screen name="stats" options={{ title: 'Statistiques' }} />
          <Stack.Screen name="profil/modifier" options={{ title: 'Modifier le profil' }} />
          <Stack.Screen name="wallet" options={{ title: 'Mon wallet' }} />
          <Stack.Screen name="adresses/index" options={{ title: 'Mes adresses' }} />
          <Stack.Screen name="adresses/nouveau" options={{ title: 'Adresse de livraison' }} />
        </Stack>
      </QueryClientProvider>
    </AppThemeProvider>
  );
}

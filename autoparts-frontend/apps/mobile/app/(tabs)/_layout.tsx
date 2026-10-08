import { Tabs } from 'expo-router';
import { DockTabBar } from '../../src/components/DockTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      // Le dock flottant remplace la barre par défaut (icônes + badge panier internes).
      tabBar={(props) => <DockTabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: '#1A4D8F',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="panier" options={{ title: 'Panier' }} />
      <Tabs.Screen name="commandes" options={{ title: 'Commandes' }} />
      <Tabs.Screen name="compte" options={{ title: 'Compte' }} />
    </Tabs>
  );
}

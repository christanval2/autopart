// ── Driver de stockage : expo-secure-store (natif) / localStorage (web) ──
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { setStorageDriver } from '@autoparts/utils';

// SecureStore limite la taille des clés (64 chars max)
const clipKey = (key: string) => key.slice(0, 60);

const secureDriver = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return localStorage.getItem(clipKey(key));
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(clipKey(key), value);
      return;
    }
    await SecureStore.setItemAsync(clipKey(key), value);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(clipKey(key));
      return;
    }
    await SecureStore.deleteItemAsync(clipKey(key));
  },
};

/** À appeler une fois au démarrage de l'app, avant hydrateAuth/hydrateCart. */
export function installSecureStorage(): void {
  setStorageDriver(secureDriver);
}

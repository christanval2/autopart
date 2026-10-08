// ── Stockage abstrait : localStorage (web) / SecureStore (mobile) ──
// La couche mobile remplace l'implémentation via `setStorageDriver`.

export interface StorageDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const localStorageDriver: StorageDriver = {
  async getItem(key) {
    return window.localStorage.getItem(key);
  },
  async setItem(key, value) {
    window.localStorage.setItem(key, value);
  },
  async removeItem(key) {
    window.localStorage.removeItem(key);
  },
};

let driver: StorageDriver = localStorageDriver;

/** Utilisé par l'app mobile pour brancher expo-secure-store. */
export function setStorageDriver(custom: StorageDriver): void {
  driver = custom;
}

export const storage = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await driver.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    await driver.setItem(key, JSON.stringify(value));
  },
  async remove(key: string): Promise<void> {
    await driver.removeItem(key);
  },
};

export const STORAGE_KEYS = {
  AUTH: 'autoparts.auth',
  CART: 'autoparts.cart',
  GUEST_CART_TOKEN: 'autoparts.guest-cart-token',
  CONSENT: 'autoparts.rgpd-consent',
  RECENT_SEARCHES: 'autoparts.recent-searches',
} as const;

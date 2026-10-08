// ── Panier mobile (Zustand, invité local + serveur à la connexion) ──
import { create } from 'zustand';
import { cartApi, authBridge } from '@autoparts/api';
import { storage, STORAGE_KEYS } from '@autoparts/utils';
import type { CartDetailed } from '@autoparts/types';

export interface CartLine {
  variantId: string;
  productName: string;
  variantSku: string;
  image?: string | null;
  unitPrice: number;
  quantity: number;
}

interface CartState {
  guestItems: CartLine[];
  serverCart: CartDetailed | null;
  loading: boolean;

  addItem(variant: Omit<CartLine, 'quantity'>, quantity: number): Promise<void>;
  updateQuantity(id: string, quantity: number): Promise<void>;
  removeItem(id: string): Promise<void>;
  clear(): Promise<void>;
  fetchServerCart(): Promise<void>;
  syncAfterLogin(): Promise<void>;
}

function isAuthed(): boolean {
  return Boolean(authBridge.getTokens()?.accessToken);
}

export const useCartStore = create<CartState>((set, get) => ({
  guestItems: [],
  serverCart: null,
  loading: false,

  async addItem(variant, quantity) {
    if (isAuthed()) {
      await cartApi.addItem(variant.variantId, quantity);
      await get().fetchServerCart();
      return;
    }
    const items = [...get().guestItems];
    const idx = items.findIndex((i) => i.variantId === variant.variantId);
    if (idx >= 0) items[idx] = { ...items[idx], quantity: items[idx].quantity + quantity };
    else items.push({ ...variant, quantity });
    set({ guestItems: items });
    void storage.set(STORAGE_KEYS.CART, items);
  },

  async updateQuantity(id, quantity) {
    if (isAuthed()) {
      await cartApi.updateItem(id, quantity);
      await get().fetchServerCart();
      return;
    }
    const items = get().guestItems.map((i) => (i.variantId === id ? { ...i, quantity } : i));
    set({ guestItems: items });
    void storage.set(STORAGE_KEYS.CART, items);
  },

  async removeItem(id) {
    if (isAuthed()) {
      await cartApi.removeItem(id);
      await get().fetchServerCart();
      return;
    }
    const items = get().guestItems.filter((i) => i.variantId !== id);
    set({ guestItems: items });
    void storage.set(STORAGE_KEYS.CART, items);
  },

  async clear() {
    if (isAuthed()) {
      await cartApi.clear();
      await get().fetchServerCart();
    }
    set({ guestItems: [] });
    void storage.set(STORAGE_KEYS.CART, []);
  },

  async fetchServerCart() {
    if (!isAuthed()) return;
    set({ loading: true });
    try {
      const cart = await cartApi.get();
      set({ serverCart: cart });
    } catch {
      // silencieux
    } finally {
      set({ loading: false });
    }
  },

  async syncAfterLogin() {
    const guest = get().guestItems;
    if (!isAuthed()) return;
    for (const gi of guest) {
      await cartApi.addItem(gi.variantId, gi.quantity).catch(() => undefined);
    }
    set({ guestItems: [] });
    void storage.set(STORAGE_KEYS.CART, []);
    await get().fetchServerCart();
  },
}));

export async function hydrateCart(): Promise<void> {
  const items = (await storage.get<CartLine[]>(STORAGE_KEYS.CART)) ?? [];
  useCartStore.setState({ guestItems: items });
  if (isAuthed()) await useCartStore.getState().fetchServerCart();
}

export function selectCount(s: CartState): number {
  if (isAuthed()) return (s.serverCart?.items ?? []).reduce((n, i) => n + i.quantity, 0);
  return s.guestItems.reduce((n, i) => n + i.quantity, 0);
}

const EMPTY_ITEMS: CartDetailed['items'] = [];

/** Référence stable (jamais un littéral frais — snapshot useSyncExternalStore). */
export function selectServerItems(s: CartState): CartDetailed['items'] {
  return s.serverCart?.items ?? EMPTY_ITEMS;
}

export function selectSubtotal(s: CartState): number {
  if (isAuthed()) return s.serverCart?.totalEstimated ?? 0;
  return s.guestItems.reduce((n, i) => n + i.unitPrice * i.quantity, 0);
}

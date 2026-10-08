// ── Panier (Zustand, persistant) ───────────────────────────────
// Invité  : panier local (localStorage) fusionné à la connexion.
// Connecté : panier serveur GET/PATCH/DELETE /cart (temps réel).
import { create } from 'zustand';
import { cartApi, authBridge } from '@autoparts/api';
import { storage, STORAGE_KEYS } from '@autoparts/utils';
import type { CartDetailed, CartItemDetailed } from '@autoparts/types';

export interface GuestCartItem {
  variantId: string;
  productName: string;
  variantSku: string;
  image?: string | null;
  unitPrice: number;
  quantity: number;
}

interface CartState {
  guestItems: GuestCartItem[];
  serverCart: CartDetailed | null;
  drawerOpen: boolean;
  loading: boolean;

  // actions
  setDrawerOpen(open: boolean): void;
  addGuestItem(item: GuestCartItem): void;
  addOrMerge(variant: Omit<GuestCartItem, 'quantity'>, quantity: number): Promise<void>;
  updateQuantity(itemIdOrVariant: string, quantity: number): Promise<void>;
  removeItem(itemIdOrVariant: string): Promise<void>;
  clear(): Promise<void>;
  fetchServerCart(): Promise<void>;
  syncGuestCartAfterLogin(): Promise<void>;
}

function persistGuest(items: GuestCartItem[]): void {
  void storage.set(STORAGE_KEYS.CART, items);
}

async function loadGuest(): Promise<GuestCartItem[]> {
  return (await storage.get<GuestCartItem[]>(STORAGE_KEYS.CART)) ?? [];
}

function isAuthed(): boolean {
  return Boolean(authBridge.getTokens()?.accessToken);
}

const initialGuest: GuestCartItem[] = [];

export const useCartStore = create<CartState>((set, get) => ({
  guestItems: initialGuest,
  serverCart: null,
  drawerOpen: false,
  loading: false,

  setDrawerOpen(open) {
    set({ drawerOpen: open });
  },

  addGuestItem(item) {
    const items = [...get().guestItems];
    const idx = items.findIndex((i) => i.variantId === item.variantId);
    if (idx >= 0) items[idx] = { ...items[idx], quantity: items[idx].quantity + item.quantity };
    else items.push(item);
    set({ guestItems: items });
    persistGuest(items);
    set({ drawerOpen: true });
  },

  async addOrMerge(variant, quantity) {
    if (isAuthed()) {
      await cartApi.addItem(variant.variantId, quantity);
      await get().fetchServerCart();
    } else {
      get().addGuestItem({ ...variant, quantity });
    }
  },

  async updateQuantity(id, quantity) {
    if (isAuthed()) {
      set({ loading: true });
      try {
        await cartApi.updateItem(id, quantity);
        await get().fetchServerCart();
      } finally {
        set({ loading: false });
      }
    } else {
      const items = get().guestItems.map((i) =>
        i.variantId === id ? { ...i, quantity } : i,
      );
      set({ guestItems: items });
      persistGuest(items);
    }
  },

  async removeItem(id) {
    if (isAuthed()) {
      await cartApi.removeItem(id);
      await get().fetchServerCart();
    } else {
      const items = get().guestItems.filter((i) => i.variantId !== id);
      set({ guestItems: items });
      persistGuest(items);
    }
  },

  async clear() {
    if (isAuthed()) {
      await cartApi.clear();
      await get().fetchServerCart();
    }
    set({ guestItems: [] });
    persistGuest([]);
  },

  async fetchServerCart() {
    if (!isAuthed()) return;
    set({ loading: true });
    try {
      const cart = await cartApi.get();
      set({ serverCart: cart });
    } catch {
      // silencieux : le panier se rechargera à la prochaine action
    } finally {
      set({ loading: false });
    }
  },

  /** À la connexion : pousse le panier invité local vers le panier serveur. */
  async syncGuestCartAfterLogin() {
    const guest = get().guestItems;
    if (!isAuthed()) return;
    if (guest.length > 0) {
      for (const gi of guest) {
        await cartApi.addItem(gi.variantId, gi.quantity).catch(() => undefined);
      }
      set({ guestItems: [] });
      persistGuest([]);
    }
    await get().fetchServerCart();
  },
}));

/** Restaure le panier invité au démarrage. */
export async function hydrateCart(): Promise<void> {
  const items = await loadGuest();
  useCartStore.setState({ guestItems: items });
  if (isAuthed()) {
    await useCartStore.getState().fetchServerCart();
  }
}

// ── Sélecteurs ─────────────────────────────────────────────────
// NB : les sélecteurs passés à useCartStore doivent renvoyer des références
// stables (snapshot) — jamais un littéral créé à l'appel ([] ou {}), sinon
// useSyncExternalStore boucle (« Maximum update depth exceeded »).
const EMPTY_ITEMS: CartItemDetailed[] = [];

export function selectCartItems(s: CartState): CartItemDetailed[] {
  return s.serverCart?.items ?? EMPTY_ITEMS;
}

export function selectCartCount(s: CartState): number {
  if (isAuthed()) return (s.serverCart?.items ?? []).reduce((n, i) => n + i.quantity, 0);
  return s.guestItems.reduce((n, i) => n + i.quantity, 0);
}

export function selectCartSubtotal(s: CartState): number {
  if (isAuthed()) return s.serverCart?.totalEstimated ?? 0;
  return s.guestItems.reduce((n, i) => n + i.unitPrice * i.quantity, 0);
}

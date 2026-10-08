// ── Store d'authentification (Zustand + persistance locale) ────
import { create } from 'zustand';
import { authApi, authBridge, type AuthTokens, type LoginDto, type RegisterDto } from '@autoparts/api';
import { storage, STORAGE_KEYS } from '@autoparts/utils';
import type { User, UserRole } from '@autoparts/types';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  hydrated: boolean;

  login(dto: LoginDto): Promise<User>;
  register(dto: RegisterDto): Promise<User>;
  verifyOtp(token: string): Promise<void>;
  logout(): Promise<void>;
  loadMe(): Promise<void>;
  setSession(tokens: AuthTokens, user: User): void;
}

type LoginResult = Awaited<ReturnType<typeof authApi.login>>;

function isTwoFAResult(r: LoginResult): r is { requiresTwoFA: true; twoFAToken: string } {
  return 'requiresTwoFA' in r;
}

// Persistance brute (l'hydratation est manuelle pour éviter tout flash)
async function persist(state: AuthState): Promise<void> {
  if (state.tokens && state.user) {
    await storage.set(STORAGE_KEYS.AUTH, { tokens: state.tokens, user: state.user });
  } else {
    await storage.remove(STORAGE_KEYS.AUTH);
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tokens: null,
  isAuthenticated: false,
  hydrated: false,

  async login(dto) {
    const result = await authApi.login(dto);
    // Cas 2FA : levée explicite — la page de login gère la seconde étape.
    if (isTwoFAResult(result)) {
      const err = new Error('DOUBLE_FA') as Error & { requiresTwoFA?: boolean; twoFAToken?: string };
      err.requiresTwoFA = true;
      err.twoFAToken = result.twoFAToken;
      throw err;
    }
    get().setSession(
      { accessToken: result.accessToken, refreshToken: result.refreshToken },
      result.user,
    );
    return result.user;
  },

  async register(dto) {
    const payload = await authApi.register(dto);
    get().setSession(
      { accessToken: payload.accessToken, refreshToken: payload.refreshToken },
      payload.user,
    );
    return payload.user;
  },

  async verifyOtp(token) {
    await authApi.verifyEmail(token);
    const user = await authApi.me();
    set((s) => ({ user: { ...s.user, ...user } as User }));
    await persist(get());
  },

  async logout() {
    await authApi.logout().catch(() => undefined);
    authBridge.setTokens(null);
    await storage.remove(STORAGE_KEYS.AUTH);
    set({ user: null, tokens: null, isAuthenticated: false });
  },

  async loadMe() {
    if (!authBridge.getTokens()) {
      set({ hydrated: true });
      return;
    }
    try {
      const user = await authApi.me();
      set((s) => {
        const tokens = authBridge.getTokens()!;
        return { user, tokens, isAuthenticated: true, hydrated: true };
      });
      await persist(get());
    } catch {
      set({ hydrated: true });
    }
  },

  setSession(tokens, user) {
    authBridge.setTokens(tokens);
    set({ tokens, user, isAuthenticated: true, hydrated: true });
    void persist(get());
  },
}));

/** Restaure la session sauvegardée au démarrage de l'app. */
export async function hydrateAuth(): Promise<void> {
  const saved = await storage.get<{ tokens: AuthTokens; user: User }>(STORAGE_KEYS.AUTH);
  if (saved?.tokens && saved?.user) {
    authBridge.setTokens(saved.tokens);
    useAuthStore.setState({
      tokens: saved.tokens,
      user: saved.user,
      isAuthenticated: true,
      hydrated: true,
    });
    // Revalidation silencieuse du profil (token peut avoir tourné)
    useAuthStore.getState().loadMe();
  } else {
    useAuthStore.setState({ hydrated: true });
  }
}

// Déconnexion automatique si le refresh token est mort (interceptor)
authBridge.onLogout(() => {
  useAuthStore.setState({ user: null, tokens: null, isAuthenticated: false });
  void storage.remove(STORAGE_KEYS.AUTH);
});

/** Page d'accueil selon le rôle le plus élevé (mapping des guards). */
export function homeForRoles(roles: UserRole[] = []): string {
  if (roles.includes('super_admin')) return '/admin/dashboard';
  if (roles.includes('logistics')) return '/admin/logistique';
  if (roles.includes('seller') || roles.includes('org_admin')) return '/b2b/dashboard';
  return '/';
}

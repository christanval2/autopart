// ── Store d'authentification mobile (Zustand + SecureStore) ────
import { create } from 'zustand';
import { authApi, authBridge, type AuthTokens, type LoginDto, type RegisterDto } from '@autoparts/api';
import { storage, STORAGE_KEYS } from '@autoparts/utils';
import type { User, UserRole } from '@autoparts/types';
import { registerForPushNotifications } from '../lib/push';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  hydrated: boolean;

  login(dto: LoginDto): Promise<User>;
  register(dto: RegisterDto): Promise<User>;
  loginWithGoogleIdToken(idToken: string): Promise<User>;
  verifyOtp(token: string): Promise<void>;
  resendOtp(): Promise<void>;
  logout(): Promise<void>;
  setSession(tokens: AuthTokens, user: User): void;
}

async function persist(state: AuthState): Promise<void> {
  if (state.tokens && state.user) {
    await storage.set(STORAGE_KEYS.AUTH, { tokens: state.tokens, user: state.user });
  } else {
    await storage.remove(STORAGE_KEYS.AUTH);
  }
}

type LoginResult = Awaited<ReturnType<typeof authApi.login>>;

function isTwoFAResult(r: LoginResult): r is { requiresTwoFA: true; twoFAToken: string } {
  return 'requiresTwoFA' in r;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tokens: null,
  isAuthenticated: false,
  hydrated: false,

  async login(dto) {
    const result = await authApi.login(dto);
    if (isTwoFAResult(result)) {
      throw new Error('2FA non supportée sur mobile pour le moment — connectez-vous sur le web');
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

  async loginWithGoogleIdToken(idToken) {
    const payload = await authApi.googleLogin({ idToken });
    get().setSession(
      { accessToken: payload.accessToken, refreshToken: payload.refreshToken },
      payload.user,
    );
    return payload.user;
  },

  async verifyOtp(token) {
    await authApi.verifyEmail(token);
    const user = await authApi.me();
    const tokens = get().tokens;
    if (tokens) set({ user: { ...get().user, ...user } as User });
    await persist(get());
  },

  async resendOtp() {
    await authApi.resendOtp();
  },

  async logout() {
    await authApi.logout().catch(() => undefined);
    authBridge.setTokens(null);
    await storage.remove(STORAGE_KEYS.AUTH);
    set({ user: null, tokens: null, isAuthenticated: false });
  },

  setSession(tokens, user) {
    authBridge.setTokens(tokens);
    set({ tokens, user, isAuthenticated: true, hydrated: true });
    void persist(get());
    // Enregistrement du token Expo push après chaque connexion (login,
    // inscription, Google) — non bloquant.
    void registerForPushNotifications();
  },
}));

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
    // Session restaurée : ré-enregistre le token push (utile après un
    // refresh de token ou une réinstallation de l'app).
    void registerForPushNotifications();
  } else {
    useAuthStore.setState({ hydrated: true });
  }
}

export function homeForRoles(roles: UserRole[] = []): string {
  // L'app mobile est orientée acheteur : tout le monde arrive sur l'accueil
  return '/(tabs)';
}

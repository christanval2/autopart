// ── Authentification : email/mdp + OTP + 2FA ───────────────────
// ⚠️ Google OAuth : aucune route /auth/google n'existe côté backend
// (voir tâche « À clarifier ») — ne pas appeler d'endpoint inventé.
import { api, unwrap, type AuthTokens } from './client';
import type { AuthPayload, User } from '@autoparts/types';

export interface LoginDto {
  email: string;
  password: string;
  /** Nom réel du champ côté backend (30j si true, sinon 24h). */
  remember?: boolean;
}

/** Le login peut renvoyer une étape 2FA au lieu des tokens (2FA activée). */
export type LoginResult =
  | AuthPayload
  | { requiresTwoFA: true; twoFAToken: string };

export interface RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  accountType?: 'individual' | 'pro';
  orgName?: string;
  /** Type d'organisation vendeur — détermine MOQ/tiers/catalogue. */
  orgType?: 'importer' | 'wholesaler' | 'retailer' | 'garage';
}

export const authApi = {
  async register(dto: RegisterDto): Promise<AuthPayload> {
    return unwrap(api.post('/auth/register', dto));
  },

  async login(dto: LoginDto): Promise<LoginResult> {
    return unwrap(api.post('/auth/login', dto));
  },

  /** 2e étape du login quand la 2FA est activée (code TOTP 6 chiffres). */
  async loginVerify2FA(twoFAToken: string, code: string): Promise<AuthPayload> {
    return unwrap(api.post('/auth/2fa/login-verify', { twoFAToken, code }));
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    return unwrap(api.post('/auth/refresh', { refreshToken }));
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      // la session est invalidée côté serveur ; on nettoie toujours localement
    }
  },

  async verifyEmail(token: string): Promise<void> {
    await unwrap(api.post('/auth/verify-email', { token }));
  },

  async forgotPassword(email: string): Promise<void> {
    await unwrap(api.post('/auth/forgot-password', { email }));
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await unwrap(api.post('/auth/reset-password', { token, password }));
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await unwrap(api.patch('/auth/change-password', { currentPassword, newPassword }));
  },

  async me(): Promise<User> {
    return unwrap(api.get('/auth/me'));
  },

  /**
   * Google OAuth : échange l'id_token Google (Google Identity Services)
   * ou le code du flow redirect contre les tokens JWT applicatifs.
   * Compte existant → connexion ; sinon création buyer email vérifié.
   */
  async googleLogin(
    dto: { idToken: string } | { code: string; redirectUri: string },
  ): Promise<AuthPayload & { created: boolean }> {
    return unwrap(api.post('/auth/google', dto));
  },

  /** Renvoi du code OTP de vérification email (60 s de cooldown côté UI). */
  async resendOtp(): Promise<void> {
    await unwrap(api.post('/auth/otp/resend', {}));
  },

  // ── 2FA (V2, routes déjà exposées) ───────────────────────────
  async twofaStatus(): Promise<unknown> {
    return unwrap(api.get('/auth/2fa/status'));
  },
  async twofaSetup(): Promise<{ otpauthUrl?: string; secret?: string }> {
    return unwrap(api.post('/auth/2fa/setup'));
  },
  async twofaEnable(token: string): Promise<void> {
    await unwrap(api.post('/auth/2fa/enable', { token }));
  },
  async twofaDisable(token: string): Promise<void> {
    await unwrap(api.post('/auth/2fa/disable', { token }));
  },
};

// ═══════════════════════════════════════════════════════════════
//  CLIENT API — axios + interceptors JWT + auto-refresh
//  Contrat backend : succès  { success: true, message, data, pagination? }
//                    erreur  { success: false, code, message, details? }
// ═══════════════════════════════════════════════════════════════

import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

// Web : Vite injecte VITE_* via import.meta.env.
// Mobile (Expo/Metro) : EXPO_PUBLIC_* via process.env.
function envValue(key: string): string | undefined {
  if (typeof process !== 'undefined' && (process as any).env) {
    const expo = (process as any).env[`EXPO_PUBLIC_${key.replace('VITE_', '')}`];
    if (expo) return expo as string;
  }
  if (typeof import.meta !== 'undefined') {
    const vite = (import.meta as any).env?.[key];
    if (vite) return vite as string;
  }
  return undefined;
}

export const API_BASE_URL: string =
  envValue('VITE_API_URL') ?? 'http://localhost:3000/api/v1';

export const SOCKET_URL: string = envValue('VITE_SOCKET_URL') ?? 'http://localhost:3000';

/**
 * Résout une URL média relative (ex. `/uploads/products/x.svg`) contre
 * l'origine de l'API — les URLs absolues et data: passent telles quelles.
 */
export function mediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^(https?:\/\/|data:|blob:)/.test(url)) return url;
  const origin = new URL(API_BASE_URL).origin;
  return url.startsWith('/') ? `${origin}${url}` : `${origin}/${url}`;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ── Pont avec le store d'authentification (apps/web & mobile) ──
let currentTokens: AuthTokens | null = null;
const logoutListeners = new Set<() => void>();

export const authBridge = {
  getTokens(): AuthTokens | null {
    return currentTokens;
  },
  setTokens(tokens: AuthTokens | null): void {
    currentTokens = tokens;
  },
  onLogout(cb: () => void): () => void {
    logoutListeners.add(cb);
    return () => logoutListeners.delete(cb);
  },
  emitLogout(): void {
    logoutListeners.forEach((cb) => cb());
  },
};

// ── Erreur normalisée ───────────────────────────────────────────
export class ApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// ── Instance axios ──────────────────────────────────────────────
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const tokens = authBridge.getTokens();
  if (tokens?.accessToken) {
    config.headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }
  return config;
});

// ── Refresh automatique (file d'attente des requêtes 401) ──────
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const tokens = authBridge.getTokens();
  if (!tokens?.refreshToken) throw new Error('Aucun refresh token');

  // axios brut : pas d'interceptor ici (évite la récursion)
  const { data } = await axios.post<{ success: boolean; data: AuthTokens }>(
    `${API_BASE_URL}/auth/refresh`,
    { refreshToken: tokens.refreshToken },
    { timeout: 15_000 },
  );
  const next = data.data;
  authBridge.setTokens(next);
  return next.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;

    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      try {
        refreshPromise = refreshPromise ?? refreshAccessToken();
        const accessToken = await refreshPromise;
        refreshPromise = null;
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${accessToken}` };
        return api.request(original);
      } catch {
        refreshPromise = null;
        authBridge.setTokens(null);
        authBridge.emitLogout();
      }
    }

    return Promise.reject(normalizeError(error));
  },
);

export function normalizeError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as
      | { success?: boolean; code?: string; message?: string; details?: unknown }
      | undefined;
    if (payload && payload.success === false) {
      return new ApiClientError(
        error.response?.status ?? 500,
        payload.message ?? 'Erreur inconnue',
        payload.code,
        payload.details,
      );
    }
    if (error.code === 'ECONNABORTED') {
      return new ApiClientError(0, 'Délai dépassé — vérifiez votre connexion');
    }
    return new ApiClientError(
      error.response?.status ?? 0,
      error.message || 'Erreur réseau',
    );
  }
  return new ApiClientError(500, String(error));
}

// ── Helpers typés (toutes les API calls passent par ici) ───────
export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages?: number;
}

export async function unwrap<T>(promise: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  try {
    const { data } = await promise;
    return data.data;
  } catch (e) {
    throw normalizeError(e);
  }
}

export async function unwrapWithPagination<T>(
  promise: Promise<{ data: ApiEnvelope<T[]> }>,
): Promise<{ items: T[]; pagination?: Pagination }> {
  try {
    const { data } = await promise;
    return { items: data.data, pagination: data.pagination };
  } catch (e) {
    throw normalizeError(e);
  }
}

/** Requête binaire (PDF facture, export CSV…) : renvoie le blob brut. */
export async function getBlob(url: string, config?: AxiosRequestConfig): Promise<Blob> {
  try {
    const { data } = await api.get(url, { ...config, responseType: 'blob' });
    return data as Blob;
  } catch (e) {
    throw normalizeError(e);
  }
}

import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { toast } from 'sonner-native';
import { googleClientIds, googleConfigured } from './google';
import { useAuthStore } from '../store/auth.store';
import { useCartStore } from '../store/cart.store';

/**
 * Flow Google :
 *  • web   → redirection pleine page vers accounts.google.com (response_type=id_token),
 *            retour sur /auth/google avec l'id_token dans le hash de l'URL.
 *            (Le popup d'expo-auth-session est souvent bloqué par les navigateurs mobiles.)
 *  • natif → androidClientId / iosClientId via expo-auth-session (flow OS).
 *  Au retour réussi, l'id_token est échangé par le backend (POST /auth/google)
 *  contre les JWT applicatifs via le store auth, puis le panier invité est fusionné.
 */

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

function buildGoogleAuthUrl(webClientId: string): string {
  const redirectUri = `${window.location.origin}/auth/google`;
  const state = `g_${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem('google_oauth_state', state);
  const params = new URLSearchParams({
    client_id: webClientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: `n_${Math.random().toString(36).slice(2)}`,
    state,
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/** Lit l'id_token + state dans le hash de retour Google, puis nettoie l'URL. */
function consumeGoogleHash(): { idToken: string } | null {
  if (!window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const idToken = params.get('id_token');
  if (!idToken) return null;
  const expectedState = sessionStorage.getItem('google_oauth_state');
  sessionStorage.removeItem('google_oauth_state');
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  if (expectedState && params.get('state') !== expectedState) return null;
  return { idToken };
}

export function useGoogleSignIn() {
  const loginWithGoogleIdToken = useAuthStore((s) => s.loginWithGoogleIdToken);
  const syncCart = useCartStore((s) => s.syncAfterLogin);
  const handled = useRef(false);

  const ids = googleClientIds();
  const isWeb = Platform.OS === 'web';
  // Sur web seul webClientId est utilisé ; en natif, les IDs de plateforme.
  const configured = isWeb
    ? Boolean(ids.webClientId)
    : Boolean(ids.androidClientId || ids.iosClientId);

  const [request, response, promptAsync] = Google.useAuthRequest({
    ...(isWeb
      ? { webClientId: ids.webClientId ?? 'placeholder.apps.googleusercontent.com' }
      : configured
        ? { androidClientId: ids.androidClientId, iosClientId: ids.iosClientId }
        : { webClientId: 'placeholder.apps.googleusercontent.com' }),
  });

  const handleIdToken = useCallback(
    (idToken: string) => {
      if (handled.current) return;
      handled.current = true;
      void (async () => {
        try {
          const user = await loginWithGoogleIdToken(idToken);
          await syncCart();
          toast.success(user.email ? `Connecté : ${user.email}` : 'Connexion Google réussie');
        } catch (e) {
          toast.error((e as Error).message ?? 'Connexion Google impossible');
        } finally {
          handled.current = false;
        }
      })();
    },
    [loginWithGoogleIdToken, syncCart],
  );

  // Web — reprise du retour de redirection Google (hash #id_token=…)
  useEffect(() => {
    if (!isWeb) return;
    const result = consumeGoogleHash();
    if (result) handleIdToken(result.idToken);
  }, [isWeb, handleIdToken]);

  // Natif — réponse expo-auth-session (id_token dans params)
  useEffect(() => {
    if (isWeb) return;
    const idToken =
      response?.type === 'success'
        ? (response.params as Record<string, string | undefined>)?.id_token ??
          (response as unknown as { id_token?: string }).id_token
        : undefined;

    if (response?.type === 'success' && idToken) {
      handleIdToken(idToken);
    } else if (response?.type === 'error') {
      toast.error('Connexion Google annulée ou échouée');
    }
  }, [response, isWeb, handleIdToken]);

  const start = useCallback(() => {
    if (!configured) {
      toast.error(
        isWeb
          ? 'Google non configuré : renseignez EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB (env) ou extra.googleClientIdWeb (app.json).'
          : 'Google non configuré : renseignez EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID / _IOS (env) ou extra.googleClientIdAndroid / googleClientIdIOS (app.json).',
      );
      return;
    }
    if (isWeb) {
      // Redirection pleine page : pas de popup bloquée par les navigateurs.
      window.location.assign(buildGoogleAuthUrl(ids.webClientId!));
      return;
    }
    void promptAsync();
  }, [configured, isWeb, ids.webClientId, promptAsync]);

  return { start, configured };
}

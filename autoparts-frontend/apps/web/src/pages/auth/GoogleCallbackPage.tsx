import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { authApi } from '@autoparts/api';
import { useAuthStore, homeForRoles } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';

/**
 * Callback Google OAuth.
 * Deux modes :
 *  - flow redirect serveur : le backend 302 vers cette page avec les tokens
 *    en fragment (#access_token=…&refresh_token=…) — jamais envoyés au serveur.
 *  - erreur : ?error=… est affiché.
 */
export default function GoogleCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const syncGuestCart = useCartStore((s) => s.syncGuestCartAfterLogin);
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('Finalisation de la connexion Google…');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('error')) {
      setStatus('error');
      setMessage("L'échange du code Google a échoué. Réessayez ou connectez-vous par email.");
      return;
    }

    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');

    if (!accessToken || !refreshToken) {
      setStatus('error');
      setMessage('Aucun token reçu. Utilisez le bouton Google ou la connexion par email.');
      return;
    }

    void (async () => {
      try {
        const user = await authApi.me();
        setSession({ accessToken, refreshToken }, user);
        await syncGuestCart();
        setStatus('ok');
        setMessage(`Bienvenue ${user.firstName} ! Redirection…`);
        setTimeout(() => navigate(homeForRoles(user.roles), { replace: true }), 900);
      } catch (e) {
        setStatus('error');
        setMessage((e as Error).message ?? 'Session invalide');
      }
    })();
  }, [location, navigate, setSession, syncGuestCart]);

  return (
    <div className="space-y-4 text-center">
      {status === 'working' && <Loader2 strokeWidth={1.5} className="mx-auto h-10 w-10 animate-spin text-primary" />}
      {status === 'ok' && <CheckCircle2 strokeWidth={1.5} className="mx-auto h-10 w-10 text-success" />}
      {status === 'error' && <AlertTriangle strokeWidth={1.5} className="mx-auto h-10 w-10 text-accent" />}
      <h1 className="text-xl font-bold">Connexion Google</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      {status === 'error' && (
        <Link
          to="/auth/connexion"
          className="inline-block rounded-input bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Revenir à la connexion
        </Link>
      )}
    </div>
  );
}

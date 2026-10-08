import { useEffect, useRef, useState } from 'react';

/**
 * Bouton « Continuer avec Google » — Google Identity Services (GIS).
 * Charge le script GSI, rend le bouton officiel et transmet l'id_token
 * (credential) au callback fourni, qui l'échange via POST /auth/google.
 * Si VITE_GOOGLE_CLIENT_ID n'est pas configuré, un message l'indique.
 */
export function GoogleAuthButton({
  label = 'Continuer avec Google',
  onCredential,
}: {
  label?: string;
  onCredential: (idToken: string) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [clientId] = useState<string | undefined>(
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID) || undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;

  useEffect(() => {
    if (!clientId || !containerRef.current) return;

    const render = () => {
      const google = (window as any).google;
      if (!google?.accounts?.id) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) return;
          setBusy(true);
          try {
            await cbRef.current(response.credential);
          } catch (e) {
            setError((e as Error).message ?? 'Connexion Google impossible');
          } finally {
            setBusy(false);
          }
        },
      });
      google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        width: 360,
        text: 'continue_with',
        locale: 'fr',
        'aria-label': label,
      });
    };

    // Le script GSI peut déjà être chargé par une autre page
    if ((window as any).google?.accounts?.id) {
      render();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [clientId, label]);

  if (!clientId) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          disabled
          className="flex h-10 w-full cursor-not-allowed items-center justify-center gap-3 rounded-input border border-input bg-card text-sm font-medium text-muted-foreground"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden className="text-muted-foreground">
          <path fill="currentColor" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
          <path fill="currentColor" opacity=".55" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.8 7.2-9.5 7.2-17z" />
          <path fill="currentColor" opacity=".8" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.8-6.1z" />
          <path fill="currentColor" opacity=".65" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.6 2.1-8.8 2.1-6.3 0-11.7-3.7-13.6-9l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
          {label}
        </button>
        <p className="rounded-input bg-accent/10 px-3 py-2 text-xs text-accent">
          Connexion Google inactive : renseignez <code>VITE_GOOGLE_CLIENT_ID</code> côté frontend et{' '}
          <code>GOOGLE_CLIENT_ID</code>/<code>GOOGLE_SECRET</code> côté backend pour l'activer.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="flex justify-center" />
      {busy && <p className="text-center text-xs text-muted-foreground">Connexion à Google…</p>}
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}

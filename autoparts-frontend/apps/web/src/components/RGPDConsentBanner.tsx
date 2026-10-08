// ── Bandeau de consentement RGPD (premier accès) ──────────────
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@autoparts/ui';
import { storage, STORAGE_KEYS } from '@autoparts/utils';

export function RGPDConsentBanner() {
  const [visible, setVisible] = useState<boolean | null>(null);

  // Décidé au premier rendu (évite le flash si déjà consenti)
  useState(() => {
    void storage.get<{ accepted: boolean }>(STORAGE_KEYS.CONSENT).then((v) => {
      setVisible(!v?.accepted);
    });
  });

  if (visible === null || !visible) return null;

  const accept = async () => {
    await storage.set(STORAGE_KEYS.CONSENT, { accepted: true, at: new Date().toISOString() });
    setVisible(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[90] border-t border-border bg-card p-4 shadow-2xl">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-muted-foreground">
          Nous utilisons des cookies essentiels au fonctionnement de la plateforme (session, panier)
          et des statistiques anonymes. Vous gardez le contrôle de vos données (RGPD — export et
          suppression disponibles dans votre compte).{' '}
          <Link to="/legal" className="text-primary underline" onClick={accept}>
            Politique de confidentialité
          </Link>
        </p>
        <Button size="sm" onClick={accept}>Accepter</Button>
      </div>
    </div>
  );
}

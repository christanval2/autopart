// ── Filet d'erreur par segment de route (React Router data router) ──
import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@autoparts/ui';

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : (error as Error)?.message ?? 'Erreur inconnue';

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-10 text-center">
      <AlertTriangle strokeWidth={1.5} className="h-12 w-12 text-accent" />
      <h1 className="text-xl font-bold">Cette page n'a pas pu s'afficher</h1>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => window.location.reload()}>
          Recharger
        </Button>
        <Link to="/">
          <Button>Retour à l'accueil</Button>
        </Link>
      </div>
    </div>
  );
}

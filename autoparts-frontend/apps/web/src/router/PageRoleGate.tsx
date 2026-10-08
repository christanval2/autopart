// ── Gate RBAC par page : chemin → rôles requis ────────────────
// Chaque layout passe sa map de pages : si le rôle de l'utilisateur ne
// correspond pas, la page affiche « Accès refusé » au lieu de tenter
// des appels API qui finiraient en 403.
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { Button } from '@autoparts/ui';
import { useAuthStore } from '@/store/auth.store';
import type { UserRole } from '@autoparts/types';

/** Pages /admin et leurs rôles requis (au moins un).
 *  Rôle « comptable » retiré : les commissions sont gérées par chaque
 *  vendeur (/b2b/commissions), la finance par le super_admin. */
export const ADMIN_PAGE_ROLES: Record<string, UserRole[]> = {
  '/admin/dashboard': ['super_admin', 'logistics'],
  '/admin/utilisateurs': ['super_admin'],
  '/admin/organisations': ['super_admin'],
  '/admin/produits': ['super_admin'],
  '/admin/categories': ['super_admin'],
  '/admin/marques': ['super_admin'],
  '/admin/commandes': ['super_admin', 'logistics'],
  '/admin/paiements': ['super_admin'],
  '/admin/logistique': ['super_admin', 'logistics'],
  '/admin/litiges': ['super_admin'],
  '/admin/commissions': ['super_admin'],
  '/admin/avis': ['super_admin'],
  '/admin/fiscalite': ['super_admin'],
  '/admin/audit': ['super_admin'],
  '/admin/analytics': ['super_admin'],
};

/** Pages /b2b et leurs rôles requis. */
export const B2B_PAGE_ROLES: Record<string, UserRole[]> = {
  '/b2b/dashboard': ['seller', 'org_admin'],
  '/b2b/produits': ['seller', 'org_admin'],
  '/b2b/stock': ['seller', 'org_admin'],
  '/b2b/commandes': ['seller', 'org_admin'],
  '/b2b/devis': ['seller', 'org_admin'],
  '/b2b/bons-de-commande': ['org_admin'],
  '/b2b/commissions': ['seller', 'org_admin'],
  '/b2b/promotions': ['seller', 'org_admin'],
  '/b2b/avis': ['seller', 'org_admin'],
  '/b2b/analytics': ['seller', 'org_admin'],
};

export function PageRoleGate({
  map,
  zone,
  children,
}: {
  map: Record<string, UserRole[]>;
  zone: string;
  children: ReactNode;
}) {
  const location = useLocation();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const required = map[location.pathname];

  if (required && !required.some((r) => roles.includes(r))) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-10 text-center">
        <ShieldOff className="h-12 w-12 text-accent" strokeWidth={1.5} />
        <h2 className="font-display text-xl font-bold">Accès refusé</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Votre profil ({roles.join(', ') || 'sans rôle'}) ne permet pas d'accéder à
          cette section de {zone}. Rôles requis : {required.join(', ')}.
        </p>
        <Button onClick={() => window.history.back()}>Retour</Button>
      </div>
    );
  }
  return <>{children}</>;
}

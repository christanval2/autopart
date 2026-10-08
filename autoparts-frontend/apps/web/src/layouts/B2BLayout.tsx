// ── Layout B2B (sidebar vendeur / org_admin) ───────────────────
import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Package, Boxes, ShoppingCart, FileText,
  ClipboardList, Percent, Star, BarChart3, LogOut, Store, TicketPercent,
  ChevronRight, ExternalLink, ShoppingBag,
} from 'lucide-react';
import { Sidebar, type NavItem } from '@/components/Sidebar';
import { PageRoleGate } from '@/router/PageRoleGate';
import { B2B_PAGE_ROLES } from '@/router/PageRoleGate';
import { Dropdown, DropdownItem, Button } from '@autoparts/ui';
import { ordersApi, analyticsApi, orgsApi } from '@autoparts/api';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { ThemeToggle } from './PublicLayout';
import { KybWizard } from '@/components/kyb/KybWizard';
import { useAuthStore } from '@/store/auth.store';

const B2B_NAV_ROLES: Record<string, string[]> = {
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

const NAV: NavItem[] = [
  { to: '/b2b/analytics', label: 'Analytics avancé', section: 'Pilotage', icon: <BarChart3 strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/b2b/dashboard', label: 'Tableau de bord', section: 'Pilotage', icon: <LayoutDashboard strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/b2b/produits', label: 'Mes produits', section: 'Catalogue', icon: <Package strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/b2b/stock', label: 'Gestion stock', section: 'Opérations', icon: <Boxes strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/b2b/commandes', label: 'Commandes entrantes', section: 'Opérations', icon: <ShoppingCart strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/b2b/devis', label: 'Devis', section: 'Ventes', icon: <FileText strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/b2b/bons-de-commande', label: 'Bons de commande', section: 'Ventes', icon: <ClipboardList strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/b2b/promotions', label: 'Promotions', section: 'Ventes', icon: <TicketPercent strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/b2b/commissions', label: 'Commissions', section: 'Finance', icon: <Percent strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/b2b/avis', label: 'Avis reçus', section: 'Confiance', icon: <Star strokeWidth={1.5} className="h-4 w-4" /> },
].map((i) => ({ ...i, roles: B2B_NAV_ROLES[i.to] }));

const PAGE_TITLES: Record<string, string> = {
  '/b2b/dashboard': 'Tableau de bord',
  '/b2b/produits': 'Mes produits',
  '/b2b/stock': 'Gestion stock',
  '/b2b/commandes': 'Commandes entrantes',
  '/b2b/devis': 'Devis',
  '/b2b/bons-de-commande': 'Bons de commande',
  '/b2b/promotions': 'Mes promotions',
  '/b2b/commissions': 'Commissions',
  '/b2b/avis': 'Avis reçus',
  '/b2b/analytics': 'Analytics avancé',
};

export function B2BLayout({ children }: { children: ReactNode }) {
  // Dark mode imposé par défaut sur l'espace vendeur
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Espace vendeur';

  const { data: org } = useQuery({
    queryKey: ['b2b', 'org', user?.orgId],
    queryFn: () => orgsApi.byId(user!.orgId!),
    enabled: Boolean(user?.orgId),
    staleTime: 5 * 60 * 1000,
  });
  const ORG_LABELS: Record<string, string> = {
    importer: 'Importateur', wholesaler: 'Grossiste', retailer: 'Détaillant', garage: 'Garage',
  };
  const orgType = org ? ORG_LABELS[org.orgType] ?? org.orgType : undefined;

  // ── Règles org_type sur l'accès à l'espace VENDEUR ─────────────
  // Importateur/grossiste : vendeurs par défaut (KYB requis si non vérifié).
  // Détaillant/garage : ACHETEURS par défaut — l'espace vente leur est
  // refusé tant qu'un admin n'a pas activé « vente » (can_sell).
  if (org && org.canSell === false) {
    return (
      <div className="min-h-screen">
        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 px-6">
          <Link to="/" className="flex items-center gap-2">
            <Store strokeWidth={1.5} className="h-5 w-5 text-accent" />
            <span className="font-display font-semibold">AutoParts</span>
          </Link>
          <button
            className="flex items-center gap-2 rounded-input px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            onClick={async () => { await logout(); navigate('/'); }}
          >
            <LogOut strokeWidth={1.5} className="h-4 w-4" /> Déconnexion
          </button>
        </header>
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <ShoppingBag strokeWidth={1.5} className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Compte acheteur professionnel</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{org.name}</span> —{' '}
            {ORG_LABELS[org.orgType] ?? org.orgType}.
            Les comptes détaillants et garages sont des comptes <strong>acheteurs</strong> :
            vous pouvez commander sur toute la marketplace, mais pas vendre.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/">
              <Button>Explorer le catalogue</Button>
            </Link>
            <Link to="/commandes">
              <Button variant="outline">Mes commandes</Button>
            </Link>
          </div>
          <p className="mt-8 text-xs text-muted-foreground">
            Vous souhaitez vendre sur AutoParts ? Demandez l'activation de la vente à
            l'administration (vérification KYB requise : RCCM, patente, statuts, CNI).
          </p>
        </div>
      </div>
    );
  }

  // Règles KYB : tant que l'organisation n'est pas vérifiée, l'espace vendeur
  // est remplacé par l'assistant « Activer la vente » (upload des documents).
  // L'achat reste possible sur le storefront — seule la vente est bloquée.
  if (org && !org.isVerified) {
    return (
      <div className="min-h-screen">
        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 px-6">
          <Link to="/" className="flex items-center gap-2">
            <Store strokeWidth={1.5} className="h-5 w-5 text-accent" />
            <span className="font-display font-semibold">AutoParts</span>
          </Link>
          <button
            className="flex items-center gap-2 rounded-input px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            onClick={async () => { await logout(); navigate('/'); }}
          >
            <LogOut strokeWidth={1.5} className="h-4 w-4" /> Déconnexion
          </button>
        </header>
        <KybWizard />
      </div>
    );
  }

  return (
    <div className="app-canvas flex min-h-screen">
      <Sidebar
        title={
          <Link to="/" className="flex items-center gap-2">
            <Store strokeWidth={1.5} className="h-5 w-5 text-accent" /> Espace Vendeur
          </Link>
        }
        items={NAV}
        roles={user?.roles ?? []}
        footer={
          <button
            className="flex w-full items-center gap-3 rounded-input px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            <LogOut strokeWidth={1.5} className="h-4 w-4" /> Déconnexion
          </button>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border/70 px-6">
          {/* Fil d'ariane : zone → page courante */}
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden text-xs font-medium uppercase tracking-wider text-muted-foreground sm:block">
              Espace vendeur
            </span>
            <ChevronRight strokeWidth={1.5} className="hidden h-3.5 w-3.5 text-muted-foreground/50 sm:block" />
            <div className="truncate font-display text-base font-semibold text-foreground">
              {pageTitle}
            </div>
            {orgType && (
              <span className="ml-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                {orgType}
              </span>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5">
            <Link
              to="/"
              className="hidden items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
            >
              <Store strokeWidth={1.5} className="h-3.5 w-3.5" /> Voir la boutique
            </Link>

            <NotificationCenter />

            <ThemeToggle />

            <Dropdown
              align="right"
              trigger={
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/20 transition-colors hover:bg-primary/20">
                  {(user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '')}
                </span>
              }
            >
              {(close) => (
                <div className="w-56">
                  <div className="border-b border-border px-4 py-2.5">
                    <div className="text-sm font-medium text-foreground">
                      {user?.firstName} {user?.lastName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(user?.roles ?? []).map((r) => (
                        <span key={r} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="py-1">
                    <DropdownItem onClick={() => { close(); navigate('/'); }}>
                      <span className="flex items-center gap-2">
                        <Store strokeWidth={1.5} className="h-4 w-4" /> Voir la boutique
                      </span>
                    </DropdownItem>
                    <div className="my-1 border-t border-border" />
                    <DropdownItem
                      danger
                      onClick={async () => {
                        close();
                        await logout();
                        navigate('/');
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <LogOut strokeWidth={1.5} className="h-4 w-4" /> Déconnexion
                      </span>
                    </DropdownItem>
                  </div>
                </div>
              )}
            </Dropdown>
          </div>
        </header>
        <main className="flex-1 p-6"><PageRoleGate map={B2B_PAGE_ROLES} zone="espace vendeur">{children}</PageRoleGate></main>
      </div>
    </div>
  );
}

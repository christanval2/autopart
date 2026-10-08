// ── Layout Admin (sidebar super_admin / logistics) ────────────
import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Building2, Package, FolderTree, Tags,
  ShoppingCart, CreditCard, Truck, Scale, Percent, TicketPercent,
  Star, Receipt, ScrollText, BarChart3, LogOut, ShieldCheck,
  ChevronRight, ExternalLink,
} from 'lucide-react';
import { Sidebar, type NavItem } from '@/components/Sidebar';
import { PageRoleGate } from '@/router/PageRoleGate';
import { ADMIN_PAGE_ROLES } from '@/router/PageRoleGate';
import { Dropdown, DropdownItem } from '@autoparts/ui';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { ThemeToggle } from './PublicLayout';
import { useAuthStore } from '@/store/auth.store';

// Rôle « comptable » retiré : commissions gérées par les vendeurs
// (/b2b/commissions), finance réservée au super_admin.
const ADMIN_NAV_ROLES: Record<string, string[]> = {
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

const NAV: NavItem[] = [
  { to: '/admin/analytics', label: 'Analytics global', section: 'Pilotage', icon: <BarChart3 strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/dashboard', label: 'Tableau de bord', section: 'Pilotage', icon: <LayoutDashboard strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/utilisateurs', label: 'Utilisateurs', section: 'Référentiel', icon: <Users strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/organisations', label: 'Organisations (KYB)', section: 'Référentiel', icon: <Building2 strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/produits', label: 'Modération produits', section: 'Catalogue', icon: <Package strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/categories', label: 'Catégories', section: 'Catalogue', icon: <FolderTree strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/marques', label: 'Marques', section: 'Catalogue', icon: <Tags strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/commandes', label: 'Commandes', section: 'Ventes', icon: <ShoppingCart strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/paiements', label: 'Paiements', section: 'Finance', icon: <CreditCard strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/logistique', label: 'Logistique', section: 'Opérations', icon: <Truck strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/litiges', label: 'Litiges', section: 'Confiance', icon: <Scale strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/commissions', label: 'Commissions', section: 'Finance', icon: <Percent strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/avis', label: 'Modération avis', section: 'Confiance', icon: <Star strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/fiscalite', label: 'Fiscalité', section: 'Finance', icon: <Receipt strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/audit', label: 'Journal d\u2019audit', section: 'Conformité', icon: <ScrollText strokeWidth={1.5} className="h-4 w-4" /> },
  { to: '/admin/analytics', label: 'Analytics global', icon: <BarChart3 strokeWidth={1.5} className="h-4 w-4" /> },
].map((i) => ({ ...i, roles: ADMIN_NAV_ROLES[i.to] }));

const PAGE_TITLES: Record<string, string> = {
  '/admin/dashboard': 'Tableau de bord',
  '/admin/utilisateurs': 'Utilisateurs',
  '/admin/organisations': 'Organisations (KYB)',
  '/admin/produits': 'Modération produits',
  '/admin/categories': 'Catégories',
  '/admin/marques': 'Marques',
  '/admin/commandes': 'Commandes',
  '/admin/paiements': 'Paiements',
  '/admin/logistique': 'Logistique',
  '/admin/litiges': 'Litiges',
  '/admin/commissions': 'Commissions',
  '/admin/promotions': 'Promotions',
  '/admin/avis': 'Modération avis',
  '/admin/fiscalite': 'Fiscalité',
  '/admin/audit': 'Journal d’audit',
  '/admin/analytics': 'Analytics global',
};

export function AdminLayout({ children }: { children: ReactNode }) {
  // Dark mode imposé par défaut sur le back-office
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Back-office';

  return (
    <div className="app-canvas flex min-h-screen">
      <Sidebar
        title={
          <Link to="/" className="flex items-center gap-2">
            <ShieldCheck strokeWidth={1.5} className="h-5 w-5 text-accent" /> AutoParts Admin
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
              Back-office
            </span>
            <ChevronRight strokeWidth={1.5} className="hidden h-3.5 w-3.5 text-muted-foreground/50 sm:block" />
            <div className="truncate font-display text-base font-semibold text-foreground">
              {pageTitle}
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5">
            <Link
              to="/"
              className="hidden items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
            >
              <ExternalLink strokeWidth={1.5} className="h-3.5 w-3.5" /> Voir le site
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
                        <ExternalLink strokeWidth={1.5} className="h-4 w-4" /> Voir le site public
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
        <main className="flex-1 p-6"><PageRoleGate map={ADMIN_PAGE_ROLES} zone="back-office">{children}</PageRoleGate></main>
      </div>
    </div>
  );
}

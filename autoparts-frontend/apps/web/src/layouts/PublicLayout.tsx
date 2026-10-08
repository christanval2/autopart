import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ShoppingCart, Wrench, Menu, X, Moon, Sun, LogOut, User, ClipboardList, MessageSquare, MessageCircle, Heart, Facebook, Instagram } from 'lucide-react';
import { Dropdown, DropdownItem } from '@autoparts/ui';
import { useCartStore, selectCartCount } from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { RGPDConsentBanner } from '@/components/RGPDConsentBanner';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { OEMSearchBar } from '@/components/search/OEMSearchBar';
import { VoiceOrderButton } from '@/components/voice/VoiceOrderButton';
import { ChatWidget } from '@/components/chat/ChatWidget';

/** Le storefront est en light mode par défaut. */
export function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  return (
    <button
      type="button"
      aria-label="Basculer le thème"
      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle('dark', next);
      }}
    >
      {dark ? <Sun className="h-4 w-4" strokeWidth={1.5} /> : <Moon className="h-4 w-4" strokeWidth={1.5} />}
    </button>
  );
}

function initials(user?: { firstName?: string; lastName?: string } | null): string {
  if (!user) return '?';
  return `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuthStore();
  const cartCount = useCartStore(selectCartCount);
  const setDrawerOpen = useCartStore((s) => s.setDrawerOpen);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Light mode imposé par défaut sur le storefront
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `relative rounded-md px-3 py-2 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:origin-left after:rounded-full after:bg-primary after:transition-transform after:duration-200 ${
      isActive
        ? 'text-foreground after:scale-x-100'
        : 'text-muted-foreground hover:text-foreground after:scale-x-0 hover:after:scale-x-100'
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Barre d'annonce */}
      <div className="bg-foreground text-background">
        <p className="mx-auto max-w-7xl px-4 py-1.5 text-center text-xs">
          Livraison express 24-48 h à Douala &amp; Yaoundé · Paiement MTN MoMo et Orange Money ·
          Prix TTC (TVA 19,25%)
        </p>
      </div>

      <header className="sticky top-0 z-40 border-b border-border bg-background/95 shadow-card backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <button className="md:hidden" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
            {mobileOpen ? <X className="h-5 w-5" strokeWidth={1.5} /> : <Menu className="h-5 w-5" strokeWidth={1.5} />}
          </button>

          {/* Marque */}
          <Link to="/" className="flex flex-shrink-0 items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <span className="hidden font-display text-lg font-bold tracking-tight text-foreground sm:block">
              AutoParts<span className="text-accent">.cm</span>
            </span>
          </Link>

          {/* Recherche centrée */}
          <div className="hidden max-w-xl flex-1 justify-center md:flex">
            <OEMSearchBar className="w-full" />
          </div>

          <nav className="ml-auto flex items-center gap-1 md:ml-0">
            <NavLink to="/catalogue" className={navLinkClass}>
              Catalogue
            </NavLink>
            <NavLink to="/suivi" className={({ isActive }) => `${navLinkClass({ isActive })} hidden lg:block`}>
              Suivi
            </NavLink>

            <button
              className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setDrawerOpen(true)}
              aria-label="Panier"
            >
              <ShoppingCart className="h-5 w-5" strokeWidth={1.5} />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                  {cartCount}
                </span>
              )}
            </button>

            <Link
              to="/favoris"
              className="hidden rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:block"
              aria-label="Mes favoris"
            >
              <Heart className="h-5 w-5" strokeWidth={1.5} />
            </Link>

            <NotificationCenter />

            {isAuthenticated ? (
              <Dropdown
                align="right"
                trigger={
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/20 transition-colors hover:bg-primary/20">
                    {initials(user)}
                  </span>
                }
              >
                {(close) => (
                  <div className="w-52">
                    <div className="border-b border-border px-4 py-2.5">
                      <div className="text-sm font-medium text-foreground">
                        {user?.firstName} {user?.lastName}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
                    </div>
                    <div className="py-1">
                      <DropdownItem onClick={() => { close(); navigate('/compte'); }}>
                        <span className="flex items-center gap-2">
                          <User className="h-4 w-4" strokeWidth={1.5} /> Mon compte
                        </span>
                      </DropdownItem>
                      <DropdownItem onClick={() => { close(); navigate('/commandes'); }}>
                        <span className="flex items-center gap-2">
                          <ClipboardList className="h-4 w-4" strokeWidth={1.5} /> Mes commandes
                        </span>
                      </DropdownItem>
                      <DropdownItem onClick={() => { close(); navigate('/messages'); }}>
                        <span className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" strokeWidth={1.5} /> Messages
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
                          <LogOut className="h-4 w-4" strokeWidth={1.5} /> Déconnexion
                        </span>
                      </DropdownItem>
                    </div>
                  </div>
                )}
              </Dropdown>
            ) : (
              <Link
                to="/auth/connexion"
                className="ml-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-sm"
              >
                Connexion
              </Link>
            )}

            <ThemeToggle />
          </nav>
        </div>

        {mobileOpen && (
          <nav className="border-t border-border px-4 py-3 md:hidden">
            <Link to="/catalogue" className="block rounded-md py-2 text-sm text-foreground hover:bg-muted" onClick={() => setMobileOpen(false)}>
              Catalogue
            </Link>
            <Link to="/recherche" className="block rounded-md py-2 text-sm text-foreground hover:bg-muted" onClick={() => setMobileOpen(false)}>
              Recherche
            </Link>
            <Link to="/suivi" className="block rounded-md py-2 text-sm text-foreground hover:bg-muted" onClick={() => setMobileOpen(false)}>
              Suivre un colis
            </Link>
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-border bg-muted/30">
        {/* Contact / newsletter */}
        <div className="mx-auto max-w-7xl px-4 pt-12">
          <div className="grid gap-8 rounded-3xl border border-border bg-card p-8 shadow-card lg:grid-cols-2">
            <div>
              <h3 className="font-display text-lg font-bold">Restez informé des nouveautés</h3>
              <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                Nouvelles références, promotions et conseils d'entretien — une fois par
                semaine, pas plus.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-2 text-sm">
              <span className="font-medium">Écrivez-nous : <a href="mailto:contact@autoparts.cm" className="text-primary hover:underline">contact@autoparts.cm</a></span>
              <span className="text-muted-foreground">Support WhatsApp : +237 6XX XX XX XX · Lun-Sam 8h-18h</span>
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wrench strokeWidth={1.5} className="h-4 w-4" />
              </span>
              <span className="font-display text-lg font-bold text-foreground">AutoParts<span className="text-accent">.cm</span></span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              La marketplace des pièces auto au Cameroun — B2B &amp; B2C.
              Yaoundé · Douala · National.
            </p>
            <div className="mt-4 flex gap-2">
              {[
                { label: 'Facebook', icon: <Facebook strokeWidth={1.5} className="h-4 w-4" /> },
                { label: 'Instagram', icon: <Instagram strokeWidth={1.5} className="h-4 w-4" /> },
                { label: 'WhatsApp', icon: <MessageCircle strokeWidth={1.5} className="h-4 w-4" /> },
              ].map((s) => (
                <a
                  key={s.label}
                  href="#"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          <div className="text-sm">
            <div className="mb-3 font-semibold text-foreground">Acheter</div>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link to="/catalogue" className="hover:text-foreground">Catalogue</Link></li>
              <li><Link to="/catalogue/marques" className="hover:text-foreground">Nos marques</Link></li>
              <li><Link to="/recherche" className="hover:text-foreground">Recherche OEM</Link></li>
              <li><Link to="/favoris" className="hover:text-foreground">Mes favoris</Link></li>
              <li><Link to="/panier" className="hover:text-foreground">Mon panier</Link></li>
            </ul>
          </div>

          <div className="text-sm">
            <div className="mb-3 font-semibold text-foreground">Vendre &amp; Pro</div>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link to="/auth/inscription" className="hover:text-foreground">Devenir vendeur</Link></li>
              <li><Link to="/b2b/dashboard" className="hover:text-foreground">Espace vendeur</Link></li>
              <li><Link to="/suivi" className="hover:text-foreground">Suivre un colis</Link></li>
            </ul>
          </div>

          <div className="text-sm">
            <div className="mb-3 font-semibold text-foreground">Support &amp; Légal</div>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link to="/legal/returns" className="hover:text-foreground">Retours &amp; garanties</Link></li>
              <li><Link to="/legal/cgv" className="hover:text-foreground">CGV</Link></li>
              <li><Link to="/legal/privacy" className="hover:text-foreground">Confidentialité</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row">
            <span>© {new Date().getFullYear()} AutoParts Marketplace SARL — RCCM RC/DLA/2024/B/1234</span>
            <span className="flex items-center gap-2">
              Paiements acceptés :
              {['MTN MoMo', 'Orange Money', 'Virement'].map((m) => (
                <span key={m} className="rounded-md border border-border bg-card px-2 py-0.5 font-medium">{m}</span>
              ))}
            </span>
          </div>
        </div>
      </footer>

      <CartDrawer />
      <VoiceOrderButton />
      <ChatWidget />
      <RGPDConsentBanner />
    </div>
  );
}

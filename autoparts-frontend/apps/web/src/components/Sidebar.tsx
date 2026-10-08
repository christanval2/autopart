// ── Sidebar rétractable (inspiration Stellar / antrepo) ────────
// • Étendue (w-60) : marque, sections, items avec pill active, badges.
// • Réduite (w-[76px]) : rail d'icônes centrées + tooltips au survol,
//   sections réduites à un séparateur, badge → point coloré.
// • Verre : .glass (translucide + backdrop-blur) sur canvas dégradé.
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@autoparts/utils';
import { Tooltip } from '@autoparts/ui';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles?: string[];
  badge?: string;
  /** Regroupement : un libellé de section est affiché quand la section change. */
  section?: string;
  /** Point coloré (indicateur d'activité) affiché près de l'item. */
  dot?: boolean;
}

const COLLAPSE_KEY = 'autoparts.sidebar.collapsed';

export function Sidebar({
  title,
  items,
  roles = [],
  footer,
}: {
  title: ReactNode;
  items: NavItem[];
  roles?: string[];
  footer?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem(COLLAPSE_KEY);
      if (saved !== null) return saved === '1';
    } catch { /* ignore */ }
    return window.innerWidth < 1280;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch { /* ignore */ }
  }, [collapsed]);

  const visible = items.filter((i) => !i.roles || i.roles.some((r) => roles.includes(r)));

  // Regroupement consécutif par section
  const groups: Array<{ section?: string; items: NavItem[] }> = [];
  visible.forEach((item) => {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  });

  return (
    <aside
      className={cn(
        'glass relative z-30 flex flex-shrink-0 flex-col border-r border-border/70 transition-[width] duration-200',
        collapsed ? 'w-[76px]' : 'w-60',
      )}
    >
      {/* Bouton d'effondrement sur le bord */}
      <button
        type="button"
        aria-label={collapsed ? 'Déployer le menu' : 'Réduire le menu'}
        onClick={() => setCollapsed((v) => !v)}
        className="absolute -right-3 top-9 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-card transition-colors hover:text-foreground"
      >
        {collapsed
          ? <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          : <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />}
      </button>

      {/* Marque */}
      <div
        className={cn(
          'flex h-16 flex-shrink-0 items-center border-b border-border/60',
          collapsed ? 'justify-center px-0' : 'px-5',
        )}
      >
        {collapsed ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary [&>a]:flex [&>a]:items-center [&>a>svg]:h-5 [&>a>svg]:w-5">
            {title}
          </span>
        ) : (
          <span className="text-base font-bold text-foreground">{title}</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {groups.map((group, gi) => (
          <div key={gi} className="pb-1">
            {group.section && !collapsed && (
              <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.section}
              </div>
            )}
            {group.section && collapsed && gi > 0 && (
              <div className="mx-3 my-2 h-px bg-border/60" />
            )}
            {group.items.map((item) =>
              collapsed ? (
                <Tooltip key={item.to} label={item.label}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'relative my-0.5 flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )
                    }
                  >
                    {item.icon}
                    {item.badge && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                        {item.badge}
                      </span>
                    )}
                    {item.dot && (
                      <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-success" />
                    )}
                  </NavLink>
                </Tooltip>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  {item.icon}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                      {item.badge}
                    </span>
                  )}
                  {item.dot && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
                </NavLink>
              ),
            )}
          </div>
        ))}
      </nav>

      {/* Pied : CTA / déconnexion */}
      {footer && (
        <div
          className={cn(
            'flex-shrink-0 border-t border-border/60 p-3',
            collapsed && 'flex justify-center [&>*]:w-auto [&>*]:px-2',
          )}
        >
          {footer}
        </div>
      )}
    </aside>
  );
}

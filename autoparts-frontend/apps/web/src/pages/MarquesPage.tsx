// ── Marques publiques : annuaire des équipementiers & OEM ──────
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck } from 'lucide-react';
import { Card, CardContent, Skeleton } from '@autoparts/ui';
import { catalogApi } from '@autoparts/api';
import type { Brand } from '@autoparts/types';

const COUNTRY_LABELS: Record<string, string> = {
  DE: 'Allemagne',
  FR: 'France',
  IT: 'Italie',
  GB: 'Royaume-Uni',
  US: 'États-Unis',
  JP: 'Japon',
  KR: 'Corée du Sud',
  CN: 'Chine',
  CM: 'Cameroun',
};

function BrandCard({ brand }: { brand: Brand }) {
  const initial = brand.name.charAt(0).toUpperCase();
  return (
    <Link
      to={`/catalogue/marques/${brand.id}`}
      className="group rounded-card border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-semibold group-hover:text-primary">{brand.name}</h3>
            {brand.isOem && (
              <span title="Équipementier d'origine (OEM)">
                <BadgeCheck strokeWidth={1.5} className="h-4 w-4 text-accent" />
              </span>
            )}
          </div>
          {brand.countryOfOrigin && (
            <p className="text-xs text-muted-foreground">
              {COUNTRY_LABELS[brand.countryOfOrigin] ?? brand.countryOfOrigin}
            </p>
          )}
        </div>
        <ArrowRight
          strokeWidth={1.5}
          className="ml-auto h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
    </Link>
  );
}

export default function MarquesPubliquesPage() {
  const { data: brands = [], isLoading } = useQuery({
    queryKey: ['catalog', 'brands'],
    queryFn: catalogApi.brands,
  });

  const sorted = [...brands].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Nos marques</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Équipementiers et pièces d'origine référencés sur la marketplace.
        </p>
      </header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune marque référencée pour le moment.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((b) => (
            <BrandCard key={b.id} brand={b} />
          ))}
        </div>
      )}
    </div>
  );
}

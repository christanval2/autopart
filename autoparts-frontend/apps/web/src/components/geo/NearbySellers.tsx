// ── Vendeurs proches (V3 — géolocalisation) ────────────────────
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Navigation } from 'lucide-react';
import { Button, Card, CardContent, Badge } from '@autoparts/ui';
import { geoApi } from '@autoparts/api';

interface NearbySeller {
  orgId?: string;
  name?: string;
  distanceKm?: number;
  distance?: number;
  [key: string]: unknown;
}

export function NearbySellers() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setDenied(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setDenied(true);
        setLocating(false);
      },
      { timeout: 8000 },
    );
  };

  const { data: sellersRaw = [] } = useQuery({
    queryKey: ['geo', 'nearby', coords],
    queryFn: () => geoApi.nearby({ lat: coords!.lat, lng: coords!.lng, radius: 50 }),
    enabled: Boolean(coords),
  });
  const sellers = sellersRaw as NearbySeller[];

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MapPin strokeWidth={1.5} className="h-4 w-4 text-accent" /> Vendeurs autour de vous
        </div>

        {!coords && !denied && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Partagez votre position (avec votre accord) pour trouver les dépôts qui ont vos pièces.
            </p>
            <Button size="sm" variant="outline" loading={locating} onClick={locate}>
              <Navigation strokeWidth={1.5} className="h-3.5 w-3.5" /> Localiser
            </Button>
          </div>
        )}
        {denied && (
          <p className="text-xs text-muted-foreground">
            Géolocalisation indisponible ou refusée — autorisez l'accès à la position dans votre navigateur.
          </p>
        )}

        {coords && sellers.length === 0 && (
          <p className="text-xs text-muted-foreground">Aucun vendeur localisé dans un rayon de 50 km.</p>
        )}
        {sellers.map((s, i) => (
          <div key={(s.orgId as string) ?? i} className="flex items-center gap-2 text-sm">
            <MapPin strokeWidth={1.5} className="h-3.5 w-3.5 text-primary" />
            <span className="flex-1 font-medium">{(s.name as string) ?? 'Vendeur local'}</span>
            {(s.distanceKm ?? s.distance) != null && (
              <Badge tone="neutral">{Number(s.distanceKm ?? s.distance).toFixed(1)} km</Badge>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

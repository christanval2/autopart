// ── Carte des livraisons (Leaflet + OpenStreetMap) ─────────────
// Trajets : ligne entrepôt d'origine → ville du destinataire,
// marqueur colis positionné selon la progression estimée du statut.
import { useEffect, useMemo, Fragment, useState } from 'react';
import { MapContainer, CircleMarker, Marker, Polyline, Popup, useMap, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { shipmentsApi, geoApi } from '@autoparts/api';
import { cityCoords, STATUS_HEX, STATUS_LABEL, interpolate, pinIcon, FastTileLayer, splitPath } from './ShipmentRouteMap';

const CENTER: [number, number] = [5.7, 12.3];

/** Progression estimée (0→1) selon le statut — même règle que /shipments/track. */
const PROGRESS: Record<string, number> = {
  preparing: 0.05,
  in_transit: 0.5,
  out_for_delivery: 0.85,
  delivered: 1,
  returned: 0,
};

interface Leg {
  key: string;
  tracking: string;
  carrier: string;
  status: string;
  origin: [number, number];
  originName: string;
  dest: [number, number];
  destName: string;
  current: [number, number];
  updatedAt?: string | null;
}

export function DeliveryMapPanel() {
  const { data: shipments } = useQuery({
    queryKey: ['logistics', 'shipments-map'],
    queryFn: () => shipmentsApi.list(1, 100),
  });

  const list = useMemo(() => shipments?.items ?? [], [shipments]);

  const legs: Leg[] = useMemo(
    () =>
      list
        .map((s) => {
          // Origine et destination fournies par l'API (warehouse + adresse)
          const origin = cityCoords(s.warehouse?.city);
          const destCity = s.order?.shippingAddress?.city ?? '';
          const dest = cityCoords(destCity);
          if (!origin || !dest) return null;
          const t = PROGRESS[s.status] ?? 0;
          return {
            key: s.id,
            tracking: s.trackingNumber ?? s.id.slice(0, 8),
            carrier: s.carrier ?? '—',
            status: s.status,
            origin,
            originName: s.warehouse?.name ?? s.warehouse?.city ?? 'Dépôt',
            dest,
            destName: destCity,
            current: interpolate(origin, dest, t),
            updatedAt: s.shippedAt ?? null,
          } as Leg;
        })
        .filter((l): l is Leg => l !== null),
    [list],
  );

  // Itinéraires routiers réels par colis (OSRM côté backend, cache 7 j).
  // Séquentiel léger : max 12 colis visibles, requêtes mises en cache ensuite.
  const [routes, setRoutes] = useState<Record<string, Array<[number, number]>>>({});
  useEffect(() => {
    let cancelled = false;
    const targets = legs.slice(0, 12);
    if (targets.length === 0) return;
    void (async () => {
      for (const l of targets) {
        try {
          const r = await geoApi.route(
            { lat: l.origin[0], lng: l.origin[1] },
            { lat: l.dest[0], lng: l.dest[1] },
          );
          if (!cancelled && r.coordinates?.length) {
            setRoutes((prev) => ({ ...prev, [l.key]: r.coordinates }));
          }
        } catch { /* repli ligne droite */ }
      }
    })();
    return () => { cancelled = true; };
  }, [legs]);

  const FitBounds = () => {
    const map = useMap();
    useEffect(() => {
      const all = legs.flatMap((l) => routes[l.key] ?? [l.origin, l.dest]);
      if (all.length === 0) return;
      // invalidateSize : la carte peut être montée avant la taille finale
      // du conteneur — sinon les tuiles sortent du cadre (rognées).
      const apply = () => {
        map.invalidateSize();
        map.fitBounds(L.latLngBounds(all).pad(0.15));
      };
      apply();
      const t = setTimeout(apply, 250);
      return () => clearTimeout(t);
    }, [map, legs.length, Object.keys(routes).length]);
    return null;
  };

  const byStatus = (status: string) => legs.filter((l) => l.status === status).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="relative overflow-hidden rounded-2xl border border-border shadow-card">
        {/* Fond shimmer : visible pendant le chargement des tuiles */}
        <div className="pointer-events-none absolute inset-0 z-0 animate-pulse bg-muted" aria-hidden />
        <MapContainer center={CENTER} zoom={6} style={{ height: 520, width: '100%' }}>
          <FastTileLayer />
          <FitBounds />
          <ScaleControl position="bottomleft" imperial={false} />

          {legs.map((l) => {
            const color = STATUS_HEX[l.status] ?? '#64748B';
            const t = PROGRESS[l.status] ?? 0;
            // Chemin réel (route OSRM) si disponible, sinon ligne droite
            const path = routes[l.key] ?? [l.origin, l.dest];
            const { point: current, before, after } = splitPath(path, t);
            return (
              <Fragment key={l.key}>
                {/* Itinéraire : parcouru (plein) / restant (pointillé) */}
                <Polyline
                  positions={after}
                  pathOptions={{ color: '#94A3B8', weight: 4, opacity: 0.5, dashArray: '8 8' }}
                />
                <Polyline
                  positions={before}
                  pathOptions={{ color, weight: 4, opacity: 0.85 }}
                />
                {/* Colis à sa position estimée — sur la route */}
                <Marker position={current} icon={pinIcon(color, '📦')}>
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">{l.tracking}</div>
                      <div>{l.carrier} · {STATUS_LABEL[l.status] ?? l.status}</div>
                      <div className="text-xs text-gray-500">
                        {l.originName} → {l.destName} ({Math.round(t * 100)}%)
                      </div>
                      {l.updatedAt && (
                        <div className="mt-1 text-xs text-gray-500">
                          Expédié : {new Date(l.updatedAt).toLocaleString('fr-FR')}
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
                {l.status !== 'delivered' && (
                  <CircleMarker
                    center={l.dest}
                    radius={7}
                    pathOptions={{ color: '#1D7A3A', weight: 2, fillColor: '#1D7A3A', fillOpacity: 0.35 }}
                  >
                    <Popup>Destination : {l.destName}</Popup>
                  </CircleMarker>
                )}
              </Fragment>
            );
          })}
        </MapContainer>
      </div>

      {/* Légende + compteur par statut */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h3 className="mb-2 text-sm font-semibold">Expéditions par statut</h3>
          <ul className="space-y-1.5 text-sm">
            {Object.entries(STATUS_LABEL).map(([key, label]) => (
              <li key={key} className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: STATUS_HEX[key] ?? '#64748B' }}
                />
                {label}
                <span className="ml-auto font-semibold tabular-nums">{byStatus(key)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground shadow-card">
          Chaque ligne relie l'entrepôt d'origine à la ville de livraison ; le
          colis 📦 est positionné selon sa progression estimée (statut). Cliquez
          pour le détail.
        </div>
      </div>
    </div>
  );
}

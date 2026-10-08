// ── Carte de trajet d'un colis : origine → position → destination ──
// Composant partagé : suivi client (/suivi) ET vue livreur (logistique).
//
// NB Leaflet : les couleurs doivent être en hex — les var(--token) CSS ne
// se résolvent pas dans les attributs SVG des marqueurs.
// Tuiles CARTO (CDN rapide, politique d'usage souple) + keepBuffer pour
// un pan fluide sans zones blanches.
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap, useMapEvents, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { geoApi } from '@autoparts/api';
// Styles Leaflet indispensables (positionnement des tuiles/marqueurs)
import 'leaflet/dist/leaflet.css';

/** Fonds de carte — Esri Streets par défaut (rendu proche de Google Maps :
 *  rues détaillées, couleurs franches). Bascule Satellite (imagerie aérienne). */
const BASEMAPS = {
  plan: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, NPS, FAO, NRCAN, GeoBase',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
} as const;

type Basemap = keyof typeof BASEMAPS;

/** Retire le voile dès la première tuile reçue — la carte se révèle
 *  progressivement au lieu d'apparaître d'un bloc (perçu plus rapide). */
function TileLoadWatcher({ onFirstTile }: { onFirstTile: () => void }) {
  useMapEvents({
    tileload: onFirstTile,
    tileerror: onFirstTile,
    load: onFirstTile,
  });
  return null;
}

/** Basculeur de fond de carte (Plan / Satellite), style Google Maps. */
function BasemapSwitch({ value, onChange }: { value: Basemap; onChange: (b: Basemap) => void }) {
  return (
    <div className="absolute right-3 top-3 z-[600] flex overflow-hidden rounded-lg border border-border bg-card/95 shadow-lg backdrop-blur">
      {(['plan', 'satellite'] as Basemap[]).map((b) => (
        <button
          key={b}
          type="button"
          onClick={() => onChange(b)}
          className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
            value === b ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          {b === 'plan' ? '🗺️ Plan' : '🛰️ Satellite'}
        </button>
      ))}
    </div>
  );
}

/** Wrapper TileLayer : fond Esri + basculeur + voile de chargement + tampon. */
export function FastTileLayer() {
  const [basemap, setBasemap] = useState<Basemap>('plan');
  const [done, setDone] = useState(false);
  // Changement de fond → voile réaffiché, puis retiré (1re tuile ou 3 s max)
  useEffect(() => {
    setDone(false);
    const t = setTimeout(() => setDone(true), 3_000);
    return () => clearTimeout(t);
  }, [basemap]);
  const bm = BASEMAPS[basemap];
  return (
    <>
      <TileLayer
        key={basemap}
        attribution={bm.attribution}
        url={bm.url}
        maxZoom={bm.maxZoom}
        keepBuffer={4}
        updateWhenZooming={false}
      />
      <TileLoadWatcher onFirstTile={() => setDone(true)} />
      <BasemapSwitch value={basemap} onChange={setBasemap} />
      {!done && <MapLoadingOverlay />}
    </>
  );
}

/** Voile discret pendant le chargement des tuiles (perception de vitesse). */
function MapLoadingOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-muted/60"
    >
      <div className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-xs font-medium text-muted-foreground shadow-lg">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Chargement de la carte…
      </div>
    </div>
  );
}

/** Villes camerounaises → coordonnées (géocodage statique, hors ligne). */
export const CM_CITIES: Array<[string, [number, number]]> = [
  ['douala', [4.0511, 9.7679]],
  ['yaound', [3.848, 11.5022]],
  ['bafoussam', [5.4737, 10.4179]],
  ['bamenda', [5.9597, 10.146]],
  ['garoua', [9.3017, 13.3921]],
  ['limbe', [4.0227, 9.6991]],
  ['maroua', [10.591, 14.3159]],
  ['ngaound', [7.3167, 13.5843]],
  ['bertoua', [4.5771, 13.6846]],
  ['ebolowa', [2.9, 11.15]],
  ['kribi', [2.9401, 9.9085]],
  ['nkongsamba', [4.9547, 9.9404]],
  ['edea', [3.8, 10.13]],
  ['kumba', [4.64, 9.44]],
  ['duala', [4.0511, 9.7679]],
];

export function cityCoords(city?: string | null): [number, number] | null {
  if (!city) return null;
  const key = city.toLowerCase().trim();
  for (const [name, coords] of CM_CITIES) {
    if (key.includes(name)) return coords;
  }
  return null;
}

/** Couleurs statut — hex (SVG Leaflet ≠ var() CSS). */
export const STATUS_HEX: Record<string, string> = {
  preparing: '#64748B',
  in_transit: '#1A4D8F',
  out_for_delivery: '#E07B00',
  delivered: '#1D7A3A',
  returned: '#DC2626',
};

export const STATUS_LABEL: Record<string, string> = {
  preparing: 'En préparation',
  in_transit: 'En transit',
  out_for_delivery: 'En livraison',
  delivered: 'Livré',
  returned: 'Retourné',
};

/** Position interpolée sur le segment origine → destination (repli hors route). */
export function interpolate(a: [number, number], b: [number, number], t: number): [number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * clamped, a[1] + (b[1] - a[1]) * clamped];
}

// ─── Découpe d'un chemin routier à une fraction donnée ─────────
function segLen(a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export interface SplitPath {
  point: [number, number];
  before: Array<[number, number]>;
  after: Array<[number, number]>;
}

/** Coupe un chemin [lat,lng][] à la fraction t (0→1) de sa longueur :
 *  renvoie le point exact sur la route + les sous-chemins avant/après. */
export function splitPath(coords: Array<[number, number]>, t: number): SplitPath {
  const clamped = Math.max(0, Math.min(1, t));
  const total = coords.slice(1).reduce((sum, c, i) => sum + segLen(coords[i], c), 0);
  if (total === 0) return { point: coords[0], before: [coords[0]], after: [coords[coords.length - 1]] };

  const target = total * clamped;
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const len = segLen(coords[i - 1], coords[i]);
    if (acc + len >= target) {
      const local = len === 0 ? 0 : (target - acc) / len;
      const point = interpolate(coords[i - 1], coords[i], local);
      return {
        point,
        before: [...coords.slice(0, i), point],
        after: [point, ...coords.slice(i)],
      };
    }
    acc += len;
  }
  const last = coords[coords.length - 1];
  return { point: last, before: coords, after: [last] };
}

/** Icône divColor : pastille colorée avec emoji/icône. */
export function pinIcon(bg: string, glyph: string) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${bg};color:#fff;width:34px;height:34px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;font-size:17px;
      border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)">${glyph}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function FitAll({ points }: { points: Array<[number, number]> }) {
  const map = useMap();

  useEffect(() => {
    if (points.length < 1) return;
    // La carte peut être montée avant la taille finale du conteneur (Card
    // chargée en différé) : sans invalidateSize, fitBounds cadre dans le
    // vide et les tuiles sortent du cadre (rognées → « carte vide »).
    const apply = () => {
      map.invalidateSize();
      if (points.length === 1) map.setView(points[0], 11);
      else map.fitBounds(L.latLngBounds(points).pad(0.25));
    };
    // Reprises échelonnées : le layout peut bouger après le montage
    // (chargement de données au-dessus de la carte, polices, images).
    apply();
    const timers = [120, 400, 1000].map((ms) => setTimeout(apply, ms));
    return () => timers.forEach(clearTimeout);
  }, [map, points]);

  // Recadre aussi quand la carte finit son init ou que le conteneur change
  useMapEvents({
    load: () => {
      map.invalidateSize();
      if (points.length === 1) map.setView(points[0], 11);
      else if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.25));
    },
    resize: () => map.invalidateSize(),
  });
  return null;
}

export interface RouteMapProps {
  origin: [number, number] | null;
  destination: [number, number] | null;
  /** 0→1 — position estimée du colis sur le segment. */
  progress: number;
  status: string;
  originLabel?: string;
  destinationLabel?: string;
  trackingNumber?: string;
  height?: number;
}

export function ShipmentRouteMap({
  origin, destination, progress, status,
  originLabel = 'Dépôt', destinationLabel = 'Destination',
  trackingNumber, height = 380,
}: RouteMapProps) {
  // Itinéraire routier réel (OSRM via backend, cache 7 j) — repli : ligne droite
  const { data: route } = useQuery({
    queryKey: ['geo', 'route', origin?.[0], origin?.[1], destination?.[0], destination?.[1]],
    queryFn: () => geoApi.route(
      { lat: origin![0], lng: origin![1] },
      { lat: destination![0], lng: destination![1] },
    ),
    enabled: Boolean(origin && destination),
    staleTime: Infinity,
    retry: 1,
  });

  if (!origin || !destination) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40 text-sm text-muted-foreground"
        style={{ height }}
      >
        Villes d'origine/destination inconnues — carte indisponible pour ce colis.
      </div>
    );
  }

  const color = STATUS_HEX[status] ?? '#64748B';
  const path: Array<[number, number]> =
    route?.coordinates?.length ? route.coordinates : [origin, destination];
  // Le colis suit la ROUTE, pas la ligne droite
  const { point: current, before: done, after: rest } = splitPath(path, progress);
  const fitPoints = path;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border shadow-card">
      {/* Fond shimmer : visible pendant le chargement JS/tuiles, puis masqué */}
      <div className="pointer-events-none absolute inset-0 z-0 animate-pulse bg-muted" aria-hidden />
      {/* bounds : cadre le trajet DÈS la création de la carte (les props
          center/zoom/bounds de MapContainer sont immuables après montage —
          un fitBounds différé peut s'exécuter avant la taille finale du
          conteneur et laisser les tuiles hors cadre). */}
      <MapContainer
        center={current}
        zoom={6}
        bounds={[origin, destination]}
        boundsOptions={{ padding: [30, 30] }}
        style={{ height, width: '100%' }}
      >
        <FastTileLayer />
        <FitAll points={fitPoints} />
        <ScaleControl position="bottomleft" imperial={false} />

        {/* Itinéraire routier : parcouru (plein) / restant (pointillé) */}
        <Polyline positions={rest} pathOptions={{ color: '#94A3B8', weight: 5, opacity: 0.55, dashArray: '10 8' }} />
        <Polyline positions={done} pathOptions={{ color, weight: 5, opacity: 0.9, lineCap: 'round' }} />

        {/* Origine : entrepôt */}
        <Marker position={origin} icon={pinIcon('#1A4D8F', '🏭')}>
          <Popup><b>{originLabel}</b><br />Point de départ</Popup>
        </Marker>

        {/* Destination : client */}
        <Marker position={destination} icon={pinIcon('#1D7A3A', '🏠')}>
          <Popup><b>{destinationLabel}</b><br />Adresse de livraison</Popup>
        </Marker>

        {/* Position actuelle du colis — SUR l'itinéraire routier */}
        <Marker position={current} icon={pinIcon(color, '📦')}>
          <Popup>
            <b>{trackingNumber ?? 'Colis'}</b><br />
            {STATUS_LABEL[status] ?? status}<br />
            Position estimée — {Math.round(progress * 100)}% du trajet
            {route && <><br />{route.distanceKm} km · ~{Math.floor(route.durationMin / 60)}h{String(route.durationMin % 60).padStart(2, '0')} de route</>}
          </Popup>
        </Marker>

        {status !== 'delivered' && (
          <CircleMarker
            center={current}
            radius={18}
            pathOptions={{ color, weight: 2, fillOpacity: 0.15, fillColor: color }}
          />
        )}
      </MapContainer>

      {/* Bandeau détails du trajet (coin bas-droit, style Google Maps) */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[600] rounded-lg border border-border bg-card/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur">
        <span className="font-semibold text-foreground">{Math.round(progress * 100)}%</span>
        <span className="text-muted-foreground"> du trajet</span>
        {route && (
          <>
            <span className="text-muted-foreground"> · </span>
            <span className="font-medium text-foreground">{route.distanceKm} km</span>
            <span className="text-muted-foreground"> · ~{Math.floor(route.durationMin / 60)}h{String(route.durationMin % 60).padStart(2, '0')}</span>
          </>
        )}
        <span className="text-muted-foreground"> · {STATUS_LABEL[status] ?? status}</span>
      </div>
    </div>
  );
}

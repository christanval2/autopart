import { createElement, useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { geoApi, type GeocodeResult, type RouteResult } from '@autoparts/api';

type Coords = [number, number]; // [lat, lng]

type Props = {
  originName: string;
  destinationName: string;
  /** Ville d'origine — géocodée via Geoapify (backend /geo/geocode). */
  originCity?: string | null;
  /** Ville de destination — géocodée via Geoapify (backend /geo/geocode). */
  destinationCity?: string | null;
  /** 0 → 1 : position estimée du colis le long de la route réelle. */
  progress?: number;
  height?: number;
};

/** Interpole un point à la fraction `t` du polygone [lat,lng] (longueurs cumulées). */
function pointAtFraction(coords: Coords[], t: number): Coords {
  if (coords.length === 0) return [0, 0];
  if (coords.length === 1) return coords[0];
  const dist = (a: Coords, b: Coords) =>
    Math.hypot(b[0] - a[0], b[1] - a[1]);
  const total = coords.slice(1).reduce((s, c, i) => s + dist(coords[i], c), 0);
  const target = Math.min(1, Math.max(0, t)) * total;
  let acc = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = dist(coords[i], coords[i + 1]);
    if (acc + d >= target) {
      const f = d === 0 ? 0 : (target - acc) / d;
      return [
        coords[i][0] + (coords[i + 1][0] - coords[i][0]) * f,
        coords[i][1] + (coords[i + 1][1] - coords[i][1]) * f,
      ];
    }
    acc += d;
  }
  return coords[coords.length - 1];
}

function buildHtml(
  originName: string,
  origin: Coords,
  destinationName: string,
  destination: Coords,
  routeCoords: Coords[] | null,
  truck: Coords,
): string {
  // JSON.stringify échappe apostrophes, guillemets et chevrons — sûr dans un <script>.
  const js = (s: string) => JSON.stringify(s);
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body{margin:0;padding:0;height:100%;background:#fff}
  #map{width:100%;height:100vh}
  .pin{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;
       background:#fff;border:3px solid #C92F3E;box-shadow:0 2px 6px rgba(0,0,0,.3);font-size:14px}
  .pin.origin{border-color:#3874FF}
</style>
</head><body>
<div id="map"></div>
<div id="err" style="color:#C92F3E;font:12px sans-serif;padding:8px"></div>
<script>
  window.onerror = function (msg) {
    document.getElementById('err').textContent = 'ERR: ' + msg;
  };
  const origin = ${JSON.stringify(origin)};
  const destination = ${JSON.stringify(destination)};
  const routeCoords = ${JSON.stringify(routeCoords)};
  const map = L.map('map', { scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  L.marker(origin, { icon: L.divIcon({ className: '', html: '<div class="pin origin">🏭</div>', iconSize: [30, 30], iconAnchor: [15, 15] }) })
    .addTo(map).bindTooltip(${js(originName)});
  L.marker(destination, { icon: L.divIcon({ className: '', html: '<div class="pin">📍</div>', iconSize: [30, 30], iconAnchor: [15, 15] }) })
    .addTo(map).bindTooltip(${js(destinationName)});

  if (routeCoords && routeCoords.length > 1) {
    L.polyline(routeCoords, { color: '#C92F3E', weight: 4, opacity: 0.85 }).addTo(map);
  } else {
    L.polyline([origin, destination], { color: '#C92F3E', weight: 3, dashArray: '6 8', opacity: 0.8 }).addTo(map);
  }

  L.marker(${JSON.stringify(truck)}, { icon: L.divIcon({ className: '', html: '<div class="pin" style="border-color:#3874FF">🚚</div>', iconSize: [30, 30], iconAnchor: [15, 15] }) })
    .addTo(map);

  map.fitBounds(L.latLngBounds(routeCoords ?? [origin, destination]).pad(0.25));

  // L'iframe peut ne pas être mis en page au moment de l'init — Leaflet garde
  // alors une taille nulle et ne charge aucune tuile. On force le recalcul.
  window.addEventListener('load', () => setTimeout(() => map.invalidateSize(), 120));
  setTimeout(() => map.invalidateSize(), 400);
  if (window.ResizeObserver) {
    new ResizeObserver(() => map.invalidateSize()).observe(document.body);
  }
</script>
</body></html>`;
}

/**
 * Carte d'itinéraire routier — Leaflet (WebView) + services geo du backend :
 * géocodage Geoapify (GET /geo/geocode) puis route réelle OSRM (GET /geo/route)
 * avec distance et durée. Le colis 🚚 est placé sur la route réelle.
 */
export function RouteMap({
  originName,
  destinationName,
  originCity,
  destinationCity,
  progress = 0,
  height = 240,
}: Props) {
  const [origin, setOrigin] = useState<GeocodeResult | null>(null);
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [failed, setFailed] = useState(false);

  const originQuery = originCity?.trim() ?? '';
  const destinationQuery = destinationCity?.trim() ?? '';

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setRoute(null);
    (async () => {
      try {
        if (originQuery.length < 2 || destinationQuery.length < 2) return;
        const [o, d] = await Promise.all([
          geoApi.geocode(`${originQuery}, Cameroun`),
          geoApi.geocode(`${destinationQuery}, Cameroun`),
        ]);
        if (cancelled) return;
        setOrigin(o);
        setDestination(d);
        try {
          const r = await geoApi.route(
            { lat: o.lat, lng: o.lng },
            { lat: d.lat, lng: d.lng },
          );
          if (!cancelled) setRoute(r);
        } catch {
          // Route indisponible : la carte retombe sur la ligne droite.
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [originQuery, destinationQuery]);

  const coords = useMemo<Coords[] | null>(() => route?.coordinates ?? null, [route]);
  const truck = useMemo<Coords>(() => {
    if (coords && coords.length > 1) return pointAtFraction(coords, progress);
    if (origin && destination)
      return [
        origin.lat + (destination.lat - origin.lat) * progress,
        origin.lng + (destination.lng - origin.lng) * progress,
      ];
    return [0, 0];
  }, [coords, origin, destination, progress]);

  if (failed || !origin || !destination) {
    if (failed || (!originQuery && !destinationQuery)) return null;
    return (
      <View
        className="items-center justify-center rounded-[14px] border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
        style={{ height: 120 }}
      >
        <Text className="text-xs text-slate-400">
          {failed ? 'Carte indisponible pour ce trajet' : 'Chargement de la carte…'}
        </Text>
      </View>
    );
  }

  const html = buildHtml(
    originName,
    [origin.lat, origin.lng],
    destinationName,
    [destination.lat, destination.lng],
    coords,
    truck,
  );

  return (
    <View className="overflow-hidden rounded-[14px] border border-slate-200 dark:border-slate-700" style={{ height }}>
      {/* react-native-webview ne supporte pas la plateforme web — iframe directe. */}
      {Platform.OS === 'web' ? (
        createElement('iframe', {
          srcDoc: html,
          title: 'Carte du trajet',
          loading: 'lazy',
          style: { width: '100%', height: '100%', border: 'none', display: 'block' },
        })
      ) : (
        <WebView source={{ html }} style={{ backgroundColor: '#E4E7EC' }} scrollEnabled={false} />
      )}
      {route ? (
        <View className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-white/95 px-2.5 py-1 shadow dark:bg-slate-900/95">
          <Text className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            {route.distanceKm} km · ~{route.durationMin} min de route
          </Text>
        </View>
      ) : null}
    </View>
  );
}

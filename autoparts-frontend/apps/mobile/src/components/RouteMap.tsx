import { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

// ── Coordonnées des villes camerounaises desservies ────────────────
const CITIES: Array<{ match: string[]; lat: number; lng: number }> = [
  { match: ['douala'], lat: 4.0511, lng: 9.7679 },
  { match: ['yaoundé', 'yaounde'], lat: 3.848, lng: 11.502 },
  { match: ['bamenda'], lat: 5.9597, lng: 10.1459 },
  { match: ['bafoussam'], lat: 5.4781, lng: 10.4179 },
  { match: ['garoua'], lat: 9.3013, lng: 13.392 },
  { match: ['maroua'], lat: 10.5957, lng: 14.3159 },
  { match: ['ngaoundéré', 'ngaoundere'], lat: 7.3167, lng: 13.5833 },
  { match: ['bertoua'], lat: 4.5771, lng: 13.6846 },
  { match: ['ebolowa'], lat: 2.9, lng: 11.15 },
  { match: ['kribi'], lat: 2.9386, lng: 9.9095 },
  { match: ['limbe'], lat: 4.0229, lng: 9.1949 },
  { match: ['kumba'], lat: 4.6361, lng: 9.4444 },
  { match: ['buea'], lat: 4.1527, lng: 9.241 },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export function cityCoords(name?: string | null): [number, number] | null {
  if (!name) return null;
  const n = norm(name);
  const city = CITIES.find((c) => c.match.some((m) => n.includes(m)));
  return city ? [city.lat, city.lng] : null;
}

type Props = {
  originName: string;
  origin: [number, number];
  destinationName: string;
  destination: [number, number];
  /** 0 → 1 : position estimée du colis sur le trajet. */
  progress?: number;
  height?: number;
};

function buildHtml(
  originName: string,
  origin: [number, number],
  destinationName: string,
  destination: [number, number],
  progress: number,
): string {
  const safe = (s: string) => s.replace(/</g, '&lt;');
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
<script>
  const origin = ${JSON.stringify(origin)};
  const destination = ${JSON.stringify(destination)};
  const map = L.map('map', { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  L.marker(origin, { icon: L.divIcon({ className: '', html: '<div class="pin origin">🏭</div>', iconSize: [30, 30], iconAnchor: [15, 15] }) })
    .addTo(map).bindTooltip('${safe(originName)}');
  L.marker(destination, { icon: L.divIcon({ className: '', html: '<div class="pin">📍</div>', iconSize: [30, 30], iconAnchor: [15, 15] }) })
    .addTo(map).bindTooltip('${safe(destinationName)}');

  L.polyline([origin, destination], { color: '#C92F3E', weight: 3, dashArray: '6 8', opacity: 0.8 }).addTo(map);

  // Position estimée du colis sur le trajet
  const p = ${JSON.stringify(Math.min(1, Math.max(0, progress)))};
  const truck = [origin[0] + (destination[0] - origin[0]) * p, origin[1] + (destination[1] - origin[1]) * p];
  L.marker(truck, { icon: L.divIcon({ className: '', html: '<div class="pin" style="border-color:#3874FF">🚚</div>', iconSize: [30, 30], iconAnchor: [15, 15] }) })
    .addTo(map);

  map.fitBounds(L.latLngBounds([origin, destination]).pad(0.25));
</script>
</body></html>`;
}

/** Carte d'itinéraire (Leaflet dans une WebView) — marche sur web et natif. */
export function RouteMap({
  originName,
  origin,
  destinationName,
  destination,
  progress = 0,
  height = 230,
}: Props) {
  const html = useMemo(
    () => buildHtml(originName, origin, destinationName, destination, progress),
    [originName, origin[0], origin[1], destinationName, destination[0], destination[1], progress],
  );

  return (
    <View className="overflow-hidden rounded-[14px] border border-slate-200 dark:border-slate-700" style={{ height }}>
      <WebView source={{ html }} style={{ backgroundColor: '#E4E7EC' }} scrollEnabled={false} />
    </View>
  );
}

/** Résout les coordonnées d'itinéraire depuis les villes du suivi (null si inconnues). */
export function resolveRouteCoords(
  originCity?: string | null,
  destinationCity?: string | null,
): { origin: [number, number]; destination: [number, number] } | null {
  const origin = cityCoords(originCity);
  const destination = cityCoords(destinationCity);
  if (!origin || !destination) return null;
  return { origin, destination };
}

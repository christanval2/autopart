import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import { AppDataSource }    from '../../config/database';
import { SellerLocation }   from '../../entities/SellerLocation';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { validate, authenticate, authorize } from '../../middlewares';
import { env }              from '../../config/env';
import { cached }           from '../../config/redis';
import { logger }           from '../../shared/utils/logger';

const UpsertLocationSchema = z.object({
  latitude:   z.number().min(-90).max(90),
  longitude:  z.number().min(-180).max(180),
  address:    z.string().max(255).trim().optional(),
  city:       z.string().max(100).trim().optional(),
  categories: z.array(z.string()).max(10).optional(),
  isVisible:  z.boolean().default(true),
});

const NearbySchema = z.object({
  lat:        z.coerce.number().min(-90).max(90),
  lng:        z.coerce.number().min(-180).max(180),
  radiusKm:   z.coerce.number().min(0.1).max(100).default(20),
  category:   z.string().optional(),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
});

const repo = () => AppDataSource.getRepository(SellerLocation);

// Distance Haversine en km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2
    + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export const GeoService = {
  async upsert(orgId: string, dto: z.infer<typeof UpsertLocationSchema>) {
    const existing = await repo().findOne({ where: { org: { id: orgId } } });
    if (existing) {
      Object.assign(existing, dto);
      return repo().save(existing);
    }
    return repo().save(repo().create({ org: { id: orgId }, ...dto }));
  },

  async nearby(query: z.infer<typeof NearbySchema>) {
    const all = await repo().find({
      where:     { isVisible: true },
      relations: ['org'],
    });

    const results = all
      .map(loc => ({
        ...loc,
        distanceKm: haversine(query.lat, query.lng, Number(loc.latitude), Number(loc.longitude)),
      }))
      .filter(loc => {
        if (loc.distanceKm > query.radiusKm) return false;
        if (query.category && !loc.categories?.includes(query.category)) return false;
        return true;
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, query.limit);

    return results;
  },

  async remove(orgId: string) {
    const loc = await repo().findOne({ where: { org: { id: orgId } } });
    if (loc) await repo().remove(loc);
  },
};

// ─── Geoapify : autocomplete + géocodage d'adresses ───────────
// Free tier 3 000 req/jour ; cache Redis 24 h pour économiser le quota
// (les adresses répétées — villes du Cameroun — reviennent souvent).

interface GeoapifyHit {
  properties: {
    lat: number; lon: number;
    formatted?: string; name?: string; street?: string; housenumber?: string;
    city?: string; state?: string; country?: string; postcode?: string;
    result_type?: string;
  };
}

async function geoapify(path: string, params: Record<string, string>): Promise<any> {
  const key = env.GEOAPIFY_API_KEY;
  if (!key) throw ApiError.badRequest('Géocodage non configuré (GEOAPIFY_API_KEY manquant)');
  const url = new URL(`https://api.geoapify.com${path}`);
  Object.entries({ ...params, apiKey: key, lang: 'fr' }).forEach(([k, v]) => url.searchParams.set(k, v));
  // Biais Cameroun : les vendeurs/clients sont majoritairement locaux
  url.searchParams.set('bias', 'proximity:11.5,4.35'); // Douala approx.
  url.searchParams.set('countrycode', 'cm');

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    logger.warn(`Geoapify ${path} → ${res.status}`);
    throw ApiError.internal('Service de géocodage indisponible');
  }
  return res.json();
}

export const geoRouter = Router();

geoRouter.get('/nearby', validate(NearbySchema, 'query'), async (req,res,next) => {
  try { res.json(ApiResponse.success(await GeoService.nearby(req.query as any))); } catch(e){next(e);}
});

// Autocomplete d'adresse (formulaire vendeur / checkout) — public
const AutocompleteSchema = z.object({ q: z.string().min(2).max(200) });
geoRouter.get('/autocomplete', validate(AutocompleteSchema, 'query'), async (req,res,next) => {
  try {
    const q = (req.query as any).q as string;
    const suggestions = await cached(`geo:ac:${q.toLowerCase()}`, async () => {
      // Pas de filtre `type` : au Cameroun les localités/quartiers sont
      // mieux couvertes que les rues strictes.
      const json = await geoapify('/v1/geocode/autocomplete', { text: q, limit: '5' });
      return (json.features ?? []).map((h: GeoapifyHit) => ({
        label:  h.properties.formatted,
        street: [h.properties.housenumber, h.properties.street].filter(Boolean).join(' ') || h.properties.name,
        city:   h.properties.city ?? h.properties.state,
        country: h.properties.country,
        postcode: h.properties.postcode,
        lat:    h.properties.lat,
        lng:    h.properties.lon,
      }));
    }, 86_400);
    res.json(ApiResponse.success(suggestions));
  } catch(e){next(e);}
});

// Géocodage direct d'une adresse texte → {lat,lng,formatted} — public
const GeocodeSchema = z.object({ address: z.string().min(3).max(300) });
geoRouter.get('/geocode', validate(GeocodeSchema, 'query'), async (req,res,next) => {
  try {
    const address = (req.query as any).address as string;
    const hit = await cached(`geo:gc:${address.toLowerCase()}`, async () => {
      const json = await geoapify('/v1/geocode/search', { text: address, limit: '1' });
      const f: GeoapifyHit | undefined = json.features?.[0];
      if (!f) return null;
      return {
        formatted: f.properties.formatted,
        lat: f.properties.lat,
        lng: f.properties.lon,
        city: f.properties.city,
        country: f.properties.country,
      };
    }, 86_400);
    if (!hit) return next(ApiError.notFound('Adresse introuvable'));
    res.json(ApiResponse.success(hit));
  } catch(e){next(e);}
});

// ─── Itinéraire routier réel (OSRM — gratuit, sans clé) ────────
// GET /geo/route?from=lat,lng&to=lat,lng → géométrie suivant les routes,
// distance et durée de conduite. Sert au trajet du colis sur les cartes.
const Coord = z.string().regex(/^-?\d{1,2}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/, 'Coordonnée invalide (lat,lng)');
const RouteSchema = z.object({ from: Coord, to: Coord });

geoRouter.get('/route', validate(RouteSchema, 'query'), async (req,res,next) => {
  try {
    const { from, to } = req.query as { from: string; to: string };
    const parse = (s: string) => s.split(',').map(Number) as [number, number];
    const [fromLat, fromLng] = parse(from);
    const [toLat, toLng] = parse(to);
    const key = `geo:route:${fromLat.toFixed(3)},${fromLng.toFixed(3)}:${toLat.toFixed(3)},${toLng.toFixed(3)}`;

    const route = await cached(key, async () => {
      // OSRM : coordonnées en lng,lat
      const url = `https://router.project-osrm.org/route/v1/driving/`
        + `${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!r.ok) throw ApiError.internal('Service d\'itinéraire indisponible');
      const json: any = await r.json();
      const route0 = json.routes?.[0];
      if (!route0) return null;
      // GeoJSON [lng,lat] → [lat,lng] + simplification (1 point sur 2)
      const coords: Array<[number, number]> = route0.geometry.coordinates
        .filter((_: unknown, i: number) => i % 2 === 0)
        .map((c: number[]) => [c[1], c[0]] as [number, number]);
      return {
        coordinates: coords,
        distanceKm:  Math.round(route0.distance / 100) / 10,
        durationMin: Math.round(route0.duration / 60),
      };
    }, 604_800); // les routes ne changent pas : cache 7 jours

    if (!route) return next(ApiError.notFound('Itinéraire introuvable entre ces points'));
    res.json(ApiResponse.success(route));
  } catch(e){next(e);}
});

geoRouter.use(authenticate);
geoRouter.put('/', authorize('org_admin','super_admin'), validate(UpsertLocationSchema), async (req,res,next) => {
  try {
    if (!req.user!.orgId) return next(ApiError.badRequest('Compte organisation requis'));
    res.json(ApiResponse.success(await GeoService.upsert(req.user!.orgId, req.body)));
  } catch(e){next(e);}
});
geoRouter.delete('/', authorize('org_admin','super_admin'), async (req,res,next) => {
  try {
    if (!req.user!.orgId) return next(ApiError.badRequest('Compte organisation requis'));
    await GeoService.remove(req.user!.orgId);
    res.json(ApiResponse.noContent());
  } catch(e){next(e);}
});

// ── Décodage VIN : CarAPI (clé) + vPIC NHTSA (repli gratuit) ──
// GET /vin/:vin → { vin, make, model, year, engine, fuel, ... }
//
// Usage marketplace : wizard véhicule (« entrez votre VIN ») →
// préremplir marque/modèle/année pour chercher les pièces compatibles.
// Le parc camerounais étant majoritairement importé d'occasion, vPIC
// couvre souvent mieux les vieux châssis japonais — d'où le repli.
import { Router, Request, Response, NextFunction } from 'express';
import { z }              from 'zod';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { validate }        from '../../middlewares';
import { env }            from '../../config/env';
import { cached }         from '../../config/redis';
import { logger }         from '../../shared/utils/logger';

const VinSchema = z.object({
  vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{11,17}$/i, 'VIN invalide (11-17 caractères, sans I/O/Q)'),
});

/** vPIC NHTSA — gratuit, sans clé. Excellente couverture import Japon/UE. */
async function decodeVpic(vin: string): Promise<Record<string, any> | null> {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const json: any = await res.json();
  const r = json.Results?.[0];
  if (!r || !r.Make) return null;
  const num = (v: string) => (v && !/^\s*$/.test(v) ? Number(v) : undefined);
  return {
    source: 'vpic',
    make: r.Make,
    model: r.Model,
    year: num(r.ModelYear),
    fuel: r.FuelTypePrimary || undefined,
    engine: r.EngineConfiguration ? `${r.DisplacementL ?? ''}L ${r.EngineConfiguration}`.trim() : (r.DisplacementL ? `${r.DisplacementL}L` : undefined),
    transmission: r.TransmissionStyle || undefined,
    bodyStyle: r.BodyClass || undefined,
    cylinders: num(r.EngineCylinders),
    manufacturedIn: r.PlantCountry || undefined,
  };
}

/** CarAPI.dev — clé requise, réponses plus riches sur les véhicules récents. */
async function decodeCarApi(vin: string): Promise<Record<string, any> | null> {
  const token = env.CAR_API_KEY;
  if (!token) return null;
  const url = `https://api.carapi.dev/v1/vin-decode/${encodeURIComponent(vin)}?token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) { logger.warn(`CarAPI → ${res.status}`); return null; }
  const json: any = await res.json();
  const s = json.specifications;
  if (!s?.make) return null;
  return {
    source: 'carapi',
    make: s.make,
    model: s.model,
    year: json.year?.year ? Number(json.year.year) : undefined,
    fuel: s.fuel || undefined,
    engine: s.enginePower ? `${s.enginePower} ${s.enginePowerUnit ?? 'kW'}` : undefined,
    transmission: s.transmission || undefined,
    bodyStyle: s.bodyStyle || undefined,
  };
}

export const vinRouter = Router();

// Public — couvert par le rate limiter global (300 req/15 min/IP)
vinRouter.get('/:vin', validate(VinSchema, 'params'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vin = (req.params as any).vin.toUpperCase();
    const decoded = await cached(`vin:${vin}`, async () => {
      // CarAPI d'abord (plus riche), vPIC en repli — les deux gratuits pour l'utilisateur
      return (await decodeCarApi(vin)) ?? (await decodeVpic(vin));
    }, 604_800); // un VIN ne change pas : cache 7 jours

    if (!decoded) {
      return next(ApiError.notFound(
        'VIN non reconnu (véhicule hors bases CarAPI/vPIC — saisissez marque et modèle manuellement)',
      ));
    }
    res.json(ApiResponse.success({ vin, ...decoded }));
  } catch (e) { next(e); }
});

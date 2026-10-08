// ── V3 : fidélité, wallet, Q&A, géolocalisation ────────────────
import { api, unwrap } from './client';
import type {
  LoyaltyBalance, LoyaltyTransaction, ProductQuestion,
  WalletBalance, WalletTransaction,
} from '@autoparts/types';

export const loyaltyApi = {
  async balance(): Promise<LoyaltyBalance> {
    return unwrap(api.get('/loyalty/balance'));
  },
  async history(): Promise<LoyaltyTransaction[]> {
    return unwrap(api.get('/loyalty/history'));
  },
  /** 100 points = 500 XAF de remise (règle métier features rev-3). */
  async redeem(points: number): Promise<unknown> {
    return unwrap(api.post('/loyalty/redeem', { points }));
  },
};

export const walletApi = {
  async balance(): Promise<WalletBalance> {
    return unwrap(api.get('/wallet/balance'));
  },
  async history(): Promise<WalletTransaction[]> {
    return unwrap(api.get('/wallet/history'));
  },
  async debit(dto: { amount: number; description?: string; orderId?: string }): Promise<unknown> {
    return unwrap(api.post('/wallet/debit', dto));
  },
  /** Retrait vers Mobile Money — débité immédiatement, approuvé par un comptable sous 24 h. */
  async withdraw(dto: { amount: number; phone: string }): Promise<unknown> {
    return unwrap(api.post('/wallet/withdraw', dto));
  },
  /** Recharge par Mobile Money — créditée au webhook après validation sur le téléphone. */
  async recharge(dto: { amount: number; phone: string; provider: 'mtn' | 'orange' }): Promise<unknown> {
    return unwrap(api.post('/payments/wallet/recharge', dto));
  },
};

export const qaApi = {
  async forProduct(productId: string): Promise<ProductQuestion[]> {
    return unwrap(api.get(`/qa/product/${productId}`));
  },
  async ask(productId: string, question: string): Promise<ProductQuestion> {
    return unwrap(api.post('/qa', { productId, question }));
  },
  async answer(id: string, answer: string): Promise<ProductQuestion> {
    return unwrap(api.post(`/qa/${id}/answer`, { answer }));
  },
};

export const geoApi = {
  async nearby(params: { lat: number; lng: number; radius?: number }): Promise<unknown[]> {
    return unwrap(api.get('/geo/nearby', { params }));
  },
  async setLocation(dto: { lat: number; lng: number; name?: string }): Promise<void> {
    await unwrap(api.put('/geo', dto));
  },
  async deleteLocation(): Promise<void> {
    await unwrap(api.delete('/geo'));
  },
  /** Autocomplete d'adresse (Geoapify, biais Cameroun) — public. */
  async autocomplete(q: string): Promise<AddressSuggestion[]> {
    return unwrap(api.get('/geo/autocomplete', { params: { q } }));
  },
  /** Adresse texte → coordonnées (Geoapify) — public. */
  async geocode(address: string): Promise<GeocodeResult> {
    return unwrap(api.get('/geo/geocode', { params: { address } }));
  },
  /** Itinéraire routier réel entre deux points (OSRM, cache backend 7 j). */
  async route(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteResult> {
    return unwrap(api.get('/geo/route', {
      params: {
        from: `${from.lat.toFixed(5)},${from.lng.toFixed(5)}`,
        to: `${to.lat.toFixed(5)},${to.lng.toFixed(5)}`,
      },
      timeout: 15_000,
    }));
  },
};

export interface RouteResult {
  coordinates: Array<[number, number]>;
  distanceKm: number;
  durationMin: number;
}

export interface AddressSuggestion {
  label: string;
  street?: string;
  city?: string;
  country?: string;
  postcode?: string;
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  formatted: string;
  lat: number;
  lng: number;
  city?: string;
  country?: string;
}

// ── OCR : photo d'étiquette/pièce → texte + références (auth requis) ──
export interface OcrParseResult {
  text: string;
  references: { oem: string[]; skus: string[] };
  confidence: boolean;
}

export const ocrApi = {
  async parseImage(file: File | Blob, language = 'fre'): Promise<OcrParseResult> {
    const form = new FormData();
    form.append('image', file);
    form.append('language', language);
    return unwrap(api.post('/ocr/parse', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 45_000,
    }));
  },
};

// ── VIN : décodage CarAPI + repli vPIC (public) ──
export interface VinDecodeResult {
  vin: string;
  source: 'carapi' | 'vpic';
  make: string;
  model: string;
  year?: number;
  fuel?: string;
  engine?: string;
  transmission?: string;
  bodyStyle?: string;
  cylinders?: number;
  manufacturedIn?: string;
}

export const vinApi = {
  async decode(vin: string): Promise<VinDecodeResult> {
    return unwrap(api.get(`/vin/${encodeURIComponent(vin.toUpperCase())}`, { timeout: 20_000 }));
  },
};

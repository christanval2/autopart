// ═══════════════════════════════════════════════════════════════
//  PHONE — chiffrement AES-256-GCM des téléphones (F1)
//  En base : phone_enc (chiffré) + phone_hash (SHA-256, recherches).
//  En API  : `phone` déchiffré, jamais phoneEnc/phoneHash.
// ═══════════════════════════════════════════════════════════════

import { encrypt, decrypt, hashSHA256 } from './helpers';

/** Champs à écrire sur l'entité User pour un numéro donné. */
export function phoneFields(phone: string | null | undefined): { phoneEnc: string | null; phoneHash: string | null } {
  if (!phone) return { phoneEnc: null, phoneHash: null };
  return { phoneEnc: encrypt(phone), phoneHash: hashSHA256(phone) };
}

/** Numéro déchiffré (ou null) — à utiliser pour l'affichage API. */
export function decryptPhone(phoneEnc: string | null | undefined): string | null {
  if (!phoneEnc) return null;
  try {
    return decrypt(phoneEnc);
  } catch {
    return null; // clé rotée ou donnée corrompue : ne pas faire planter l'API
  }
}

/** Sanitize d'un user : retire les champs sensibles, expose `phone` déchiffré. */
export function sanitizeUserPhone<T extends { phoneEnc?: string | null; phoneHash?: string | null }>(
  raw: T,
): Omit<T, 'phoneEnc' | 'phoneHash'> & { phone: string | null } {
  const { phoneEnc, phoneHash, ...rest } = raw;
  return { ...rest, phone: decryptPhone(phoneEnc) } as Omit<T, 'phoneEnc' | 'phoneHash'> & { phone: string | null };
}

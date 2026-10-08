import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import crypto                 from 'crypto';
import { env }                from '../../config/env';

// ═══════════════════════════════════════════════════════════
//  Pagination
// ═══════════════════════════════════════════════════════════

export interface PaginationResult<T> {
  data:  T[];
  total: number;
  page:  number;
  limit: number;
}

export async function paginate<T extends ObjectLiteral>(
  qb:    SelectQueryBuilder<T>,
  page:  number = 1,
  limit: number = 20,
): Promise<PaginationResult<T>> {
  const safePage  = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));

  const [data, total] = await qb
    .skip((safePage - 1) * safeLimit)
    .take(safeLimit)
    .getManyAndCount();

  return { data, total, page: safePage, limit: safeLimit };
}

// ═══════════════════════════════════════════════════════════
//  Générateurs
// ═══════════════════════════════════════════════════════════

export function generateOrderNumber(): string {
  const now    = new Date();
  const year   = now.getFullYear();
  const month  = String(now.getMonth() + 1).padStart(2, '0');
  const day    = String(now.getDate()).padStart(2, '0');
  const random = crypto.randomInt(10_000, 99_999);
  return `ORD-${year}${month}${day}-${random}`;
}

export function generateRef(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

export function generateOTP(length = 6): string {
  return Array.from(
    { length },
    () => crypto.randomInt(0, 10),
  ).join('');
}

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

// ═══════════════════════════════════════════════════════════
//  Chiffrement AES-256-GCM
// ═══════════════════════════════════════════════════════════

const ALGO = 'aes-256-gcm';

export function encrypt(text: string): string {
  const iv        = crypto.randomBytes(12);
  const cipher    = crypto.createCipheriv(ALGO, Buffer.from(env.ENCRYPTION_KEY), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag   = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, encHex] = payload.split(':');
  const decipher = crypto.createDecipheriv(
    ALGO,
    Buffer.from(env.ENCRYPTION_KEY),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(encHex, 'hex', 'utf8') + decipher.final('utf8');
}

export function hashSHA256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ═══════════════════════════════════════════════════════════
//  Formatage
// ═══════════════════════════════════════════════════════════

export function formatXAF(amount: number): string {
  return new Intl.NumberFormat('fr-CM', {
    style:                 'currency',
    currency:              'XAF',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function truncate(str: string, maxLength: number): string {
  return str.length > maxLength ? str.slice(0, maxLength - 1) + '…' : str;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════
//  Sécurité — Sanitisation des entrées
// ═══════════════════════════════════════════════════════════

/**
 * Nettoie un paramètre ORDER BY/GROUP BY — whitelist stricte.
 * Protège contre l'injection SQL dans les clauses ORDER BY dynamiques.
 */
export function safeOrderBy<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Protège un input de recherche LIKE/ILIKE.
 * Échappe les caractères spéciaux PostgreSQL LIKE (%,_,\).
 * La valeur résultante doit toujours être passée en paramètre bindé, jamais interpolée.
 */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Valide qu'une valeur est un entier positif sûr (protection coercition).
 */
export function safePositiveInt(value: unknown, fallback = 1): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Whitelist pour les colonnes de tri dans les tableaux admin.
 */
export const SORT_COLS = {
  products:       ['name', 'basePrice', 'createdAt', 'sku'] as const,
  orders:         ['orderedAt', 'totalAmount', 'status'] as const,
  organizations:  ['name', 'createdAt', 'creditLimit'] as const,
  users:          ['firstName', 'email', 'createdAt'] as const,
} as const;

// ═══════════════════════════════════════════════════════════
//  Sérialisation sûre — exclusion des champs sensibles
// ═══════════════════════════════════════════════════════════

/**
 * Retire le passwordHash avant de sérialiser un User.
 * À utiliser sur tout objet User avant de l'envoyer en réponse.
 */
export function sanitizeUser<T extends { passwordHash?: unknown }>(
  user: T,
): Omit<T, 'passwordHash'> {
  const { passwordHash, ...safe } = user as any;
  return safe;
}

/**
 * Retire passwordHash de façon récursive dans les relations imbriquées.
 * Ex: order.buyer.passwordHash, shipment.order.buyer.passwordHash
 */
export function sanitizeDeep(obj: unknown): unknown {
  if (obj instanceof Date) return obj; // un spread réduirait une Date à {}
  if (Array.isArray(obj))  return obj.map(sanitizeDeep);
  if (obj && typeof obj === 'object') {
    const sanitized = { ...obj } as any;
    if ('passwordHash' in sanitized) delete sanitized.passwordHash;
    for (const key of Object.keys(sanitized)) {
      if (sanitized[key] && typeof sanitized[key] === 'object') {
        sanitized[key] = sanitizeDeep(sanitized[key]);
      }
    }
    return sanitized;
  }
  return obj;
}

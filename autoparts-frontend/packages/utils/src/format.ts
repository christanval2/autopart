// ── Formatage XAF / dates fr ───────────────────────────────────

/** 25000 → "25 000 FCFA" (XAF n'a pas de décimales). */
export function formatPrice(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (Number.isNaN(n)) return '— FCFA';
  return `${n.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} FCFA`;
}

/** Formate un prix avec devise affichée choisie (XAF par défaut). */
export function formatPriceWithCurrency(amount: number, currency = 'XAF'): string {
  if (currency === 'XAF') return formatPrice(amount);
  return `${amount.toLocaleString('fr-FR')} ${currency}`;
}

/**
 * Convertit n'importe quelle valeur de date renvoyée par l'API (ISO string,
 * epoch number, Date, null, valeur inconnue) en Date valide — ou null.
 * Ne lève jamais : les cellules de tableaux ne doivent pas faire planter la page.
 */
function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(date: unknown): string {
  const d = toDate(date);
  return d?.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '—';
}

export function formatDateTime(date: unknown): string {
  const d = toDate(date);
  return (
    d?.toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) ?? '—'
  );
}

/** "Il y a 5 min" pour les fils de notifications. */
export function timeAgo(date: unknown): string {
  const d = toDate(date);
  if (!d) return '—';
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "à l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return formatDate(d);
}

/** Tranche un numéro de commande long pour l'affichage. */
export function shortId(id: string | null | undefined, size = 8): string {
  if (!id) return '—';
  return id.length <= size ? id : `${id.slice(0, size)}…`;
}

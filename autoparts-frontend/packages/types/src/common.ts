// ── Types transverses ───────────────────────────────────────────

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages?: number;
}

export interface Paginated<T> {
  items: T[];
  pagination?: Pagination;
}

/** Toutes les dates circulent en ISO string dans le JSON. */
export type ISODate = string;

export interface ID {
  id: string;
}

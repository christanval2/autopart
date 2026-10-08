// ── Catégories & marques (référentiels globaux) ────────────────

export interface Category {
  id: string;
  name: string;
  parentId?: string | null;
  slug: string;
  depth: number;
  isActive: boolean;
}

/** Arbre construit côté front depuis la liste à plat. */
export interface CategoryNode extends Category {
  children: CategoryNode[];
}

export interface Brand {
  id: string;
  name: string;
  countryOfOrigin?: string | null;
  isOem: boolean;
  isActive: boolean;
}

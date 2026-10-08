// ── Administration : organisations, tiers, référentiels, produits ──
import { api, unwrap, unwrapWithPagination } from './client';
import type {
  Brand, Category, Organization, OrgTier, OrgMember, OrgType,
  OrgDocument, OrgDocumentType,
  Product, ProductVariant, ProductCompatibility, ProductImage, AuditLogEntry, User,
} from '@autoparts/types';

// ── Organisations (KYB, crédit, membres) ──────────────────────
export const orgsApi = {
  async list(page = 1, limit = 20) {
    return unwrapWithPagination<Organization>(api.get('/organizations', { params: { page, limit } }));
  },
  async byId(id: string): Promise<Organization> {
    return unwrap(api.get(`/organizations/${id}`));
  },
  async create(dto: { name: string; orgType: OrgType; email?: string; phone?: string }): Promise<Organization> {
    return unwrap(api.post('/organizations', dto));
  },
  async update(id: string, dto: Partial<Organization>): Promise<Organization> {
    return unwrap(api.patch(`/organizations/${id}`, dto));
  },
  async verify(id: string): Promise<Organization> {
    return unwrap(api.post(`/organizations/${id}/verify`));
  },
  // NB : le backend attend `{ limit }` (POST /organizations/:id/credit-limit)
  async setCreditLimit(id: string, creditLimit: number): Promise<Organization> {
    return unwrap(api.post(`/organizations/${id}/credit-limit`, { limit: creditLimit }));
  },
  // Règles org_type — toggle « peut vendre » (exception garage/retailer
  // activé vendeur). Réservé au super_admin côté backend.
  async setCanSell(id: string, canSell: boolean): Promise<Organization> {
    return unwrap(api.post(`/organizations/${id}/can-sell`, { canSell }));
  },
  async members(id: string): Promise<OrgMember[]> {
    return unwrap(api.get(`/organizations/${id}/members`));
  },
  async updateMemberRole(orgId: string, userId: string, roles: string[]): Promise<void> {
    await unwrap(api.patch(`/organizations/${orgId}/members/${userId}/roles`, { roles }));
  },

  // ── KYB : documents de vérification vendeur ────────────────────
  /** Documents KYB d'une organisation (la sienne pour un vendeur). */
  async kybDocuments(orgId: string): Promise<OrgDocument[]> {
    return unwrap(api.get(`/organizations/${orgId}/kyb/documents`));
  },
  /** Téléversement d'un document KYB (PDF/image, vendeur). */
  async uploadKybDocument(orgId: string, file: File, type: OrgDocumentType): Promise<OrgDocument> {
    const form = new FormData();
    form.append('document', file);
    form.append('type', type);
    return unwrap(api.post(`/organizations/${orgId}/kyb/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30_000,
    }));
  },
  /** File d'attente KYB (super_admin). */
  async kybPending(): Promise<OrgDocument[]> {
    return unwrap(api.get('/organizations/kyb/pending'));
  },
  /** Décision admin sur un document (approve | reject + motif). */
  async kybDecide(documentId: string, decision: 'approve' | 'reject', reason?: string): Promise<OrgDocument> {
    return unwrap(api.post(`/organizations/kyb/${documentId}/decide`, { decision, reason }));
  },
  async assignTier(orgId: string, tierId: string): Promise<void> {
    await unwrap(api.post(`/organizations/${orgId}/assign-tier`, { tierId }));
  },
  async tiers(): Promise<OrgTier[]> {
    return unwrap(api.get('/organizations/tiers/list'));
  },
  async createTier(dto: { name: string; discountPercent: number; minOrderAmount?: number }): Promise<OrgTier> {
    return unwrap(api.post('/organizations/tiers', dto));
  },
};

// ── Catégories (CRUD super_admin) ──────────────────────────────
export const categoriesAdminApi = {
  async list(): Promise<Category[]> {
    return unwrap(api.get('/categories'));
  },
  async create(dto: { name: string; parentId?: string; isActive?: boolean }): Promise<Category> {
    return unwrap(api.post('/categories', dto));
  },
  async update(id: string, dto: { name?: string; parentId?: string | null; isActive?: boolean }): Promise<Category> {
    return unwrap(api.patch(`/categories/${id}`, dto));
  },
  async remove(id: string): Promise<void> {
    await unwrap(api.delete(`/categories/${id}`));
  },
};

// ── Marques (CRUD super_admin) ────────────────────────────────
export const brandsAdminApi = {
  async list(): Promise<Brand[]> {
    return unwrap(api.get('/brands'));
  },
  async create(dto: { name: string; countryOfOrigin?: string; isOem?: boolean }): Promise<Brand> {
    return unwrap(api.post('/brands', dto));
  },
  async update(id: string, dto: { name?: string; countryOfOrigin?: string | null; isOem?: boolean; isActive?: boolean }): Promise<Brand> {
    return unwrap(api.patch(`/brands/${id}`, dto));
  },
  async remove(id: string): Promise<void> {
    await unwrap(api.delete(`/brands/${id}`));
  },
};

// ── Produits (CRUD vendeur/admin) ──────────────────────────────
export const productsAdminApi = {
  async create(dto: Partial<Product> & { name: string; sku: string; basePrice: number; categoryId: string; brandId: string }): Promise<Product> {
    return unwrap(api.post('/products', dto));
  },
  async update(id: string, dto: Partial<Product>): Promise<Product> {
    return unwrap(api.patch(`/products/${id}`, dto));
  },
  async remove(id: string): Promise<void> {
    await unwrap(api.delete(`/products/${id}`));
  },
  /**
   * Contrat backend (CreateVariantSchema) : variantSku unique, costPrice
   * obligatoire, priceOverride optionnel (prix affiché sinon basePrice).
   */
  async addVariant(
    id: string,
    dto: {
      variantSku: string;
      attributes?: Record<string, string>;
      costPrice: number;
      priceOverride?: number;
      reorderPoint?: number;
    },
  ): Promise<ProductVariant> {
    return unwrap(api.post(`/products/${id}/variants`, dto));
  },
  async addCompatibility(id: string, dto: Omit<ProductCompatibility, 'id'>): Promise<ProductCompatibility> {
    return unwrap(api.post(`/products/${id}/compatibilities`, dto));
  },
  async bulkImport(file: File): Promise<unknown> {
    const form = new FormData();
    form.append('file', file);
    return unwrap(api.post('/products/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
  },
};

// ── Utilisateurs (admin) ──────────────────────────────────────
export const usersAdminApi = {
  async updateRoles(id: string, roles: string[]): Promise<User> {
    return unwrap(api.patch(`/users/${id}/roles`, { roles }));
  },
};

// ── Commissions ────────────────────────────────────────────────
export const commissionsApi = {
  async list(page = 1, limit = 20) {
    return unwrapWithPagination(api.get('/commissions', { params: { page, limit } }));
  },
  /** Renvoie une ligne par statut : [{ status, total, count }]. */
  async summary(): Promise<Array<{ status: string; total: number; count: number }>> {
    return unwrap(api.get('/commissions/summary'));
  },
  async validate(id: string): Promise<void> {
    await unwrap(api.post(`/commissions/${id}/validate`));
  },
  async markPaid(id: string): Promise<void> {
    await unwrap(api.post(`/commissions/${id}/pay`));
  },
};

// ── Journal d'audit ────────────────────────────────────────────
export const auditApi = {
  async list(page = 1, limit = 50) {
    return unwrapWithPagination<AuditLogEntry>(api.get('/audit', { params: { page, limit } }));
  },
};

// ── Fiscalité / exports ────────────────────────────────────────
export const fiscalApi = {
  async invoicePreview(orderId: string): Promise<unknown> {
    return unwrap(api.get(`/invoices/${orderId}/preview`));
  },
};

// ── Configuration TVA (GET/PUT /admin/tax-config) ──────────────
export interface TaxConfigDto {
  id: string;
  countryCode: string;
  /** Taux décimal (0.1925). */
  rate: number;
  /** Taux en pourcentage (19.25) — utilisé par l'UI. */
  ratePercent: number;
  isActive: boolean;
  exemptedCategoryIds: string[];
  updatedAt?: string;
}

export const taxConfigApi = {
  async get(): Promise<TaxConfigDto> {
    return unwrap(api.get('/admin/tax-config'));
  },
  async put(dto: {
    ratePercent: number;
    countryCode?: string;
    isActive?: boolean;
    exemptedCategoryIds?: string[];
  }): Promise<TaxConfigDto> {
    return unwrap(api.put('/admin/tax-config', dto));
  },
};

// ── Uploads produit (multer : champ unique `image`, bulk `images`) ──
export const uploadsApi = {
  async uploadProductImage(productId: string, file: File, isPrimary = false): Promise<ProductImage> {
    const form = new FormData();
    form.append('image', file);
    if (isPrimary) form.append('isPrimary', 'true');
    return unwrap(
      api.post(`/uploads/products/${productId}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    );
  },

  async uploadProductImages(productId: string, files: File[]): Promise<unknown> {
    const form = new FormData();
    files.forEach((f) => form.append('images', f));
    return unwrap(
      api.post(`/uploads/products/${productId}/bulk`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    );
  },

  async deleteImage(imageId: string): Promise<void> {
    await unwrap(api.delete(`/uploads/images/${imageId}`));
  },
};

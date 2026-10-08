// ── Profil utilisateur + adresses ──────────────────────────────
import { api, unwrap, unwrapWithPagination } from './client';
import type { Address, User } from '@autoparts/types';

export const usersApi = {
  async profile(): Promise<User> {
    return unwrap(api.get('/users/me'));
  },
  async updateProfile(dto: Partial<Pick<User, 'firstName' | 'lastName' | 'phone'>>): Promise<User> {
    return unwrap(api.patch('/users/me', dto));
  },
  async deleteAccount(): Promise<void> {
    await unwrap(api.delete('/users/me'));
  },
};

/** Aligné sur le schéma backend : street (≥5 car.), city, postalCode, countryCode (2 lettres). */
export interface AddressInput {
  label?: string;
  street: string;
  city: string;
  postalCode?: string;
  countryCode?: string;
  isDefault?: boolean;
}

export const addressesApi = {
  async list(): Promise<Address[]> {
    return unwrap(api.get('/addresses'));
  },
  async create(dto: AddressInput): Promise<Address> {
    return unwrap(api.post('/addresses', dto));
  },
  async update(id: string, dto: Partial<Omit<Address, 'id' | 'userId'>>): Promise<Address> {
    return unwrap(api.patch(`/addresses/${id}`, dto));
  },
  async remove(id: string): Promise<void> {
    await unwrap(api.delete(`/addresses/${id}`));
  },
};

// Liste utilisateurs (admin) — GET /users?page=&limit=
export const adminUsersApi = {
  async list(page = 1, limit = 20) {
    return unwrapWithPagination<User>(api.get('/users', { params: { page, limit } }));
  },
  async getById(id: string): Promise<User> {
    return unwrap(api.get(`/users/${id}`));
  },
  async updateRoles(id: string, roles: string[]): Promise<User> {
    return unwrap(api.patch(`/users/${id}/roles`, { roles }));
  },
  async remove(id: string): Promise<void> {
    await unwrap(api.delete(`/users/${id}`));
  },
};

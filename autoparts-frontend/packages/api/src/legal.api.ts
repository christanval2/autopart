// ── Pages légales publiques (GET /legal/*) ─────────────────────
import { api, unwrap } from './client';

export interface LegalSection {
  title: string;
  content: string;
}

export interface CgvContent {
  version: string;
  updatedAt: string;
  company: string;
  rccm: string;
  sections: LegalSection[];
}

export interface ReturnPolicy {
  summary: string;
  steps: Array<{ step: number; title: string; desc: string }>;
  reasons: Array<{ code: string; label: string; delay: number; frais: string }>;
  exclusions: string[];
}

export interface PrivacyContent {
  version: string;
  rights: string;
  contact: string;
}

export const legalApi = {
  async cgv(): Promise<CgvContent> {
    return unwrap(api.get('/legal/cgv'));
  },
  async returns(): Promise<ReturnPolicy> {
    return unwrap(api.get('/legal/returns'));
  },
  async privacy(): Promise<PrivacyContent> {
    return unwrap(api.get('/legal/privacy'));
  },
};

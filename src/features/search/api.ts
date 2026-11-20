import type { DocumentType } from 'floman-shared/documentTypes';
import { api } from '@/api/client';

/** GET /search?q= (server: services/search.service.ts): each result only where the user may open it. */
export type DocumentHit = {
  kind: DocumentType;
  id: string;
  number: string;
  owner: string | null;
  status: string;
  date: string;
  total: number | null;
};
export type PartyHit = { id: string; name: string; type: string; city: string; balance: number | null };
export type PartHit = { id: string; name: string; hsn: string | null; uom: string };
export type SearchResult = { documents: DocumentHit[]; parties: PartyHit[]; parts: PartHit[] };

export const search = (q: string) => api<SearchResult>(`/search?q=${encodeURIComponent(q)}`);

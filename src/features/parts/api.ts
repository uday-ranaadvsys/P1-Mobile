import { api, apiWithMessage, type Meta } from '@/api/client';

export type PartGroup = { id: string; name: string };
export type TaxRate = { id: number; percentage: number | string; isDefault?: boolean };
export type Uom = { id?: number; code: string; name?: string | null; description?: string | null };

/** A part (server: Part). The price fields only come for those who may see prices. */
export type Part = {
  id: string;
  partType: string;
  name: string;
  /** The part's own code, kept on a purchase line. */
  code?: string | null;
  description: string | null;
  uom: string;
  /** An older price field the web falls back to when there is no selling price. */
  defaultPrice?: number | string | null;
  defaultTax: number | string;
  sellingPriceWithTax?: number | null;
  sellingPriceWithoutTax?: number | null;
  purchasePriceWithTax?: number | null;
  purchasePriceWithoutTax?: number | null;
  hsn: string | null;
  inStock: number | string | null;
  /** Below this it shows as low stock (none: never low). */
  minStock: number | string | null;
  classifications?: PartGroup[];
  taxRateId: number | null;
  taxRate?: TaxRate | null;
  isActive: boolean;
};

/** What the part form sends (server: CreatePartSchema). */
export type PartInput = {
  partType: string;
  name: string;
  description: string | null;
  hsn: string | null;
  /** Opening stock: a new part only; an edit never sends it. */
  inStock?: number | null;
  minStock: number | null;
  classificationIds: string[];
  taxRateId: number | null;
  sellingPriceWithoutTax: number;
  sellingPriceWithTax: number;
  purchasePriceWithoutTax: number | null;
  purchasePriceWithTax: number | null;
  defaultTax: number;
  uom: string;
  isActive: boolean;
};

export type PartFilters = {
  search?: string;
  type?: string;
  group?: string;
  status?: string;
  sort?: string;
  missingHsn?: boolean;
  lowStock?: boolean;
  ids?: string;
};

export type PartStats = { total: number; active: number; deactive: number; missingHsn: number; lowStock: number };

const query = (params: Record<string, string | number | boolean | undefined>) => {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== false);
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

/** One page of parts and the cards' counts (GET /parts). */
export async function listParts(page: number, limit: number, f: PartFilters) {
  const { data, meta } = await apiWithMessage<Part[]>(`/parts${query({ page, limit, ...f })}`);
  return { rows: data, meta: meta as (Meta & { stats?: PartStats }) | null };
}

/** One part: the server has no route for a single part, so it is asked for by its id (the list's ?ids=). */
export async function getPart(id: string): Promise<Part> {
  const { rows } = await listParts(1, 1, { ids: id, status: 'all' });
  if (!rows[0]) throw new Error('Part not found');
  return rows[0];
}

/** The groups, GST rates and units the part form offers (GET /parts/meta). */
export type PartMeta = { classifications: PartGroup[]; taxRates: TaxRate[]; uoms: Uom[] };
export const getPartMeta = () => api<PartMeta>('/parts/meta');

export const createPart = (body: PartInput) => api<Part>('/parts', { method: 'POST', body });
export const updatePart = (id: string, body: PartInput) => api<Part>(`/parts/${id}`, { method: 'PUT', body });
export const setPartActive = (id: string, isActive: boolean) => api<Part>(`/parts/${id}`, { method: 'PUT', body: { isActive } });

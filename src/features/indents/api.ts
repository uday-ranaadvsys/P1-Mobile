import { api, apiWithMessage, type Meta } from '@/api/client';
import type { HistoryEntry } from '@/features/quotations/api';

type Person = { id?: string; firstName?: string | null; lastName?: string | null; email?: string | null };

/** What covers a line: the Purchase, Purchase Order or Purchase Indent that took its quantity, with the GRNs that delivered it. */
type GrnRef = { qty: number | string; grn: { id: string; grnNumber: string } };
export type IndentCover = {
  purchaseAllocations?: { allocatedQty: number | string; purchaseItem?: { purchase?: { id: string; purchaseNumber: string; status: string } | null; grnItems?: GrnRef[] } | null }[];
  poAllocations?: { allocatedQty: number | string; poItem?: { purchaseOrder?: { id: string; poNumber: string; status: string } | null; grnItems?: GrnRef[] } | null }[];
  prAllocations?: { allocatedQty: number | string; prItem?: { purchaseIndent?: { id: string; prNumber: string; status: string } | null } | null }[];
};

export type IndentItem = IndentCover & {
  id: string;
  partId?: string | null;
  partName: string;
  partCode?: string | null;
  partDescription?: string | null;
  hsn?: string | null;
  qty: number | string;
  orderedQty?: number | string | null;
  receivedQty?: number | string | null;
  uom: string;
  estimatedUnitPrice?: number | string | null;
  estimatedTotal?: number | string | null;
  /** The line's specifications / notes. */
  notes?: string | null;
  status?: string;
  cancellationReason?: string | null;
};

/** An Indent as the list and its detail read it (server: Indent). */
export type Indent = {
  id: string;
  indentNumber: string;
  status: string;
  priority: string;
  requiredByDate?: string | null;
  departmentId?: string | null;
  department?: { id: string; name: string; code?: string | null } | null;
  projectName?: string | null;
  projectCode?: string | null;
  reference?: string | null;
  notes?: string | null;
  termsAndConditions?: string | null;
  seriesId?: string | null;
  shippingLocationId?: string | null;
  approverRemarks?: string | null;
  returnedAt?: string | null;
  returnedBy?: Person | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: Person | null;
  createdBy?: Person | null;
  createdAt: string;
  items?: IndentItem[];
  auditLogs?: HistoryEntry[];
};

/** The cards' counts on the web's Indents screen (the list's `kpis`). */
export type IndentStats = {
  allTotalCount: number;
  draftCount: number;
  submittedCount: number;
  returnedCount: number;
  partiallyOrderedCount: number;
  orderedCount: number;
  partiallyReceivedCount: number;
  receivedCount: number;
  cancelledCount: number;
  totalEstimatedValue: number;
  waitingValue: number;
  waitingPastRequiredBy: number;
};

export type IndentFilters = { search?: string; status?: string; priority?: string; departmentId?: string; sort?: string; from?: string; to?: string };

const query = (params: Record<string, string | number | undefined>) => {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

/** One page of Indents and the cards' counts (GET /indents: the list comes inside `data`, with its `kpis`). */
export async function listIndents(page: number, limit: number, f: IndentFilters) {
  const { data } = await apiWithMessage<{ indents: Indent[]; pagination: Meta; kpis: IndentStats }>(`/indents${query({ page, limit, ...f })}`);
  return { rows: data.indents, meta: data.pagination, stats: data.kpis };
}

/** One Indent with its lines, what covers them, and its history (GET /indents/:id). */
export const getIndent = (id: string) => api<Indent>(`/indents/${id}`);

/** What a save sends (the web's payload). */
export type IndentPayload = Record<string, unknown>;

/** Saves a new Indent as a Draft or submitted (POST /indents). */
export const createIndent = (body: IndentPayload) => api<Indent>('/indents', { method: 'POST', body });

/** Saves a Draft or a returned Indent (PATCH /indents/:id). */
export const updateIndent = (id: string, body: IndentPayload) => api<Indent>(`/indents/${id}`, { method: 'PATCH', body });

/** A Draft goes to the purchaser. */
export const submitIndent = (id: string) => api<Indent>(`/indents/${id}/submit`, { method: 'POST' });

/** The purchaser sends it back to the requester with a remark. */
export const returnIndent = (id: string, remarks: string) => api<Indent>(`/indents/${id}/return`, { method: 'POST', body: { remarks } });

/** Voids an Indent (the server refuses while its lines are ordered). */
export const cancelIndent = (id: string, reason: string) => api<Indent>(`/indents/${id}/cancel`, { method: 'POST', body: { reason } });

/** A cancelled Indent back as a Draft with the same number (only while the company's lock is off). */
export const restoreIndent = (id: string, reason: string) => apiWithMessage<Indent>(`/indents/${id}/restore`, { method: 'POST', body: reason ? { reason } : {} });

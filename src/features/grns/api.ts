import { api, apiWithMessage, type Meta } from '@/api/client';
import type { HistoryEntry } from '@/features/quotations/api';

type Person = { id?: string; firstName?: string | null; lastName?: string | null; email?: string | null };
type PlaceCopy = { text?: string } | null;

export type GrnItem = {
  id: string;
  partId?: string | null;
  partName: string;
  partCode?: string | null;
  partDescription?: string | null;
  hsn?: string | null;
  qty?: number | string;
  inwardQty?: number | string;
  freeQty?: number | string;
  uom: string;
  unitPrice: number | string;
  discount?: number | string | null;
  discountType?: string | null;
  taxRate: number | string;
  taxAmount?: number | string | null;
  totalAmount?: number | string | null;
  /** The line of the Purchase Order / Purchase it was received against. */
  poItemId?: string | null;
  purchaseItemId?: string | null;
};

/** A payment made against the GRN (its Linked documents). */
export type GrnPaymentLink = { id: string; amount: number | string; payment: { id: string; paymentDate: string; mode: string; status: string } };
export type GrnDebitNote = { id: string; noteNumber: string; status: string; grandTotal: number | string; noteDate: string };

/** A scanned bill: the files attached (as the upload route returns them) or the one link. */
export type BillFile = { url?: string; path?: string; originalName?: string; filename?: string };

/** A GRN as the list and its detail read it (server: Grn). Money arrives as text or numbers. */
export type Grn = {
  id: string;
  grnNumber: string;
  status: string;
  paymentStatus?: string | null;
  vendorId?: string;
  vendorInvoiceNumber?: string | null;
  vendorInvoiceDate?: string | null;
  grnDate: string;
  dueDate?: string | null;
  paymentTerms?: string | null;
  projectName?: string | null;
  projectCode?: string | null;
  clientName?: string | null;
  notes?: string | null;
  terms?: string | null;
  subtotal: number | string;
  extraDiscount?: number | string | null;
  /** The extra discount in ₹ (extraDiscount is its %). */
  discountAmount?: number | string | null;
  taxAmount: number | string;
  roundOffAmount?: number | string | null;
  grandTotal: number | string;
  paidAmount?: number | string | null;
  balanceAmount?: number | string | null;
  tcsRate?: number | string | null;
  tcsAmount?: number | string | null;
  gstTdsRate?: number | string | null;
  gstTdsAmount?: number | string | null;
  incomeTdsRate?: number | string | null;
  incomeTdsAmount?: number | string | null;
  isRoundOff?: boolean | null;
  seriesId?: string | null;
  billingAddressId?: string | null;
  billingLocationId?: string | null;
  shippingLocationId?: string | null;
  shippingAddressId?: string | null;
  purchaseOrderId?: string | null;
  purchaseId?: string | null;
  billAttachmentUrl?: string | null;
  attachmentPaths?: BillFile[] | null;
  approvalRemarks?: string | null;
  approvedAt?: string | null;
  returnedAt?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: Person | null;
  editedAt?: string | null;
  editedBy?: Person | null;
  approvedBy?: Person | null;
  createdBy?: Person | null;
  createdAt: string;
  vendor?: ({ id: string; name: string; gstin?: string | null; city?: string | null; state?: string | null } & Record<string, unknown>) | null;
  billTo?: PlaceCopy;
  shipTo?: PlaceCopy;
  purchaseOrder?: { id: string; poNumber: string; status?: string; grandTotal?: number | string | null } | null;
  purchase?: { id: string; purchaseNumber: string; vendorBillNumber?: string | null; status?: string; grandTotal?: number | string | null } | null;
  customFields?: Record<string, unknown> | null;
  items?: GrnItem[];
  paymentLinks?: GrnPaymentLink[];
  debitNotes?: GrnDebitNote[];
  auditLogs?: HistoryEntry[];
};

/** The cards' counts on the web's GRN screen (the list's kpiCounts, as `meta.stats`). */
export type GrnStats = {
  all: number;
  draft: number;
  pendingApproval: number;
  returned: number;
  approved: number;
  received: number;
  cancelled: number;
  unpaid: number;
  partiallyPaid: number;
  paid: number;
  totalValue: number;
  billedValue: number;
  toPayValue: number;
  overdue: number;
};

export type GrnFilters = { search?: string; status?: string; paymentStatus?: string; sort?: string; amount?: string; from?: string; to?: string; vendorId?: string };

const query = (params: Record<string, string | number | undefined>) => {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

/** One page of GRNs and the cards' counts (GET /grns). */
export async function listGrns(page: number, limit: number, f: GrnFilters) {
  const { data, meta } = await apiWithMessage<Grn[]>(`/grns${query({ page, limit, ...f })}`);
  return { rows: data, meta: meta as (Meta & { stats?: GrnStats }) | null };
}

/** One GRN with its lines, payments, debit notes and history (GET /grns/:id). */
export const getGrn = (id: string) => api<Grn>(`/grns/${id}`);

/** What a save sends (the web's payload); the server works out every amount. */
export type GrnPayload = Record<string, unknown>;

/** Saves a new GRN as a Draft, for approval, or received (POST /grns). */
export const createGrn = (body: GrnPayload) => api<Grn>('/grns', { method: 'POST', body });

/** Saves a Draft, a returned GRN or an approved one being edited (it goes for approval again): PUT /grns/:id. */
export const updateGrn = (id: string, body: GrnPayload) => api<Grn>(`/grns/${id}`, { method: 'PUT', body });

/** Voids a GRN: its received quantities are taken back out of stock. The server refuses while a Debit Note on it is live. */
export const cancelGrn = (id: string, reason: string) => api<Grn>(`/grns/${id}/cancel`, { method: 'POST', body: { reason } });

/** A cancelled GRN back as a Draft with the same number (only while the company's lock is off). */
export const restoreGrn = (id: string, reason: string) => apiWithMessage<Grn>(`/grns/${id}/restore`, { method: 'POST', body: reason ? { reason } : {} });

/** What stops Edit on an approved GRN (the company's lock, or a live Debit Note), asked before its form opens. */
export const grnEditCheck = async (id: string) => (await api<{ block: { code?: string; message: string } | null }>(`/grns/${id}/edit-check`)).block;

/** Is the vendor's bill number already on another Purchase or GRN that financial year? The server's message, or null. */
export async function checkVendorBill(params: { vendorId: string; billNumber: string; billDate: string; excludeGrnId?: string }): Promise<string | null> {
  const data = await api<{ message?: string | null } | null>(`/grns/vendor-bill${query({ ...params })}`);
  return data?.message ?? null;
}

import { api, apiWithMessage, type Meta } from '@/api/client';
import type { HistoryEntry } from '@/features/quotations/api';

type Person = { id?: string; firstName?: string | null; lastName?: string | null; email?: string | null };
type PlaceCopy = { text?: string } | null;

export type PurchaseIndentItem = {
  id: string;
  partId?: string | null;
  partName: string;
  partCode?: string | null;
  partDescription?: string | null;
  scopeOfWork?: string | null;
  hsn?: string | null;
  qty: number | string;
  freeQty?: number | string;
  uom: string;
  unitPrice: number | string;
  discount?: number | string | null;
  discountType?: string | null;
  taxRate: number | string;
  totalAmount?: number | string | null;
  status?: string;
  indentRef?: string | null;
  cancellationReason?: string | null;
  /** The Indent lines this line orders (shown under Linked documents). */
  indentAllocations?: { indentItemId: string; allocatedQty: number | string; indentItem?: { indent?: { id: string; indentNumber: string } | null } | null }[];
};

/** The Purchase Order made when it was approved. */
export type PurchaseIndentOrder = { id: string; poNumber: string; status: string; grandTotal?: number | string | null };

/** A Purchase Indent as the list and its detail read it (server: PurchaseIndent). Money arrives as text or numbers. */
export type PurchaseIndent = {
  id: string;
  prNumber: string;
  status: string;
  orderDate?: string;
  deliveryDueDate?: string | null;
  expectedDeliveryDate?: string | null;
  paymentTerms?: string | null;
  projectName?: string | null;
  projectCode?: string | null;
  clientName?: string | null;
  notes?: string | null;
  terms?: string | null;
  subtotal?: number | string | null;
  taxAmount: number | string;
  grandTotal: number | string;
  extraDiscount?: number | string | null;
  discountAmount?: number | string | null;
  approvalRemarks?: string | null;
  approvedAt?: string | null;
  returnedAt?: string | null;
  returnedBy?: Person | null;
  approvedBy?: Person | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  createdBy?: Person | null;
  createdAt: string;
  isRoundOff?: boolean | null;
  seriesId?: string | null;
  vendorId?: string;
  billingAddressId?: string | null;
  billingLocationId?: string | null;
  shippingLocationId?: string | null;
  shippingAddressId?: string | null;
  vendor?: ({ id: string; name: string; gstin?: string | null; city?: string | null; state?: string | null } & Record<string, unknown>) | null;
  billTo?: PlaceCopy;
  shipTo?: PlaceCopy;
  customFields?: Record<string, unknown> | null;
  items?: PurchaseIndentItem[];
  purchaseOrders?: PurchaseIndentOrder[];
  auditLogs?: HistoryEntry[];
};

/** The cards' counts on the web's Purchase Indents screen (the list's `kpis`). */
export type PurchaseIndentStats = {
  totalCount: number;
  pendingApproval: number;
  approved: number;
  returned: number;
  converted: number;
  totalValue: number;
  pendingApprovalValue: number;
  returnedValue: number;
  convertedValue: number;
  convertedValueRate: number | null;
};

export type PurchaseIndentFilters = { search?: string; status?: string; sort?: string; amount?: string; from?: string; to?: string; vendorId?: string };

const query = (params: Record<string, string | number | undefined>) => {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

/** One page of Purchase Indents and the cards' counts (GET /purchase-indents: the list comes inside `data`, with its `kpis`). */
export async function listPurchaseIndents(page: number, limit: number, f: PurchaseIndentFilters) {
  const { data } = await apiWithMessage<{ items: PurchaseIndent[]; pagination: Meta; kpis: PurchaseIndentStats }>(`/purchase-indents${query({ page, limit, ...f })}`);
  return { rows: data.items, meta: data.pagination, stats: data.kpis };
}

/** One Purchase Indent with its lines, the Indent lines they order, its Purchase Order and history. */
export const getPurchaseIndent = (id: string) => api<PurchaseIndent>(`/purchase-indents/${id}`);

export type PurchaseIndentPayload = Record<string, unknown>;

/** Saves a new Purchase Indent as a Draft or for approval (POST /purchase-indents). */
export const createPurchaseIndent = (body: PurchaseIndentPayload) => api<PurchaseIndent>('/purchase-indents', { method: 'POST', body });

/** Saves a Draft, returned or waiting one (PUT /purchase-indents/:id). */
export const updatePurchaseIndent = (id: string, body: PurchaseIndentPayload) => api<PurchaseIndent>(`/purchase-indents/${id}`, { method: 'PUT', body });

/** Voids a Purchase Indent; `indentLines` says what happens to the Indent lines it ordered. */
export const cancelPurchaseIndent = (id: string, reason: string, indentLines: string) =>
  apiWithMessage<PurchaseIndent>(`/purchase-indents/${id}/cancel`, { method: 'POST', body: { reason, indentLines } });

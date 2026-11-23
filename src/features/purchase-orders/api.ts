import { api, apiWithMessage, type Meta } from '@/api/client';
import type { EditBlock, HistoryEntry } from '@/features/quotations/api';

type Person = { id?: string; firstName?: string | null; lastName?: string | null; email?: string | null };
type PlaceCopy = { text?: string } | null;

export type PurchaseOrderItem = {
  id: string;
  partId?: string | null;
  partName: string;
  partCode?: string | null;
  partDescription?: string | null;
  scopeOfWork?: string | null;
  hsn?: string | null;
  qty: number | string;
  freeQty?: number | string;
  receivedQty?: number | string | null;
  /** Held by GRNs that are not cancelled yet (drafts too), and which ones. */
  heldQty?: number | string | null;
  heldBy?: { qty: number; number: string }[];
  uom: string;
  unitPrice: number | string;
  discount?: number | string | null;
  discountType?: string | null;
  taxRate: number | string;
  totalAmount?: number | string | null;
  status?: string;
  approverRemarks?: string | null;
};

/** A GRN made against the order (its Linked documents). */
export type PurchaseOrderGrn = { id: string; grnNumber: string; vendorInvoiceNumber?: string | null; status: string; paymentStatus?: string | null; grandTotal: number | string; grnDate?: string | null };

/** A Purchase Order as the list and its detail read it (server: PurchaseOrder). Money arrives as text or numbers. */
export type PurchaseOrder = {
  id: string;
  poNumber: string;
  status: string;
  orderDate?: string;
  deliveryDueDate?: string | null;
  expectedDeliveryDate?: string | null;
  supplierQuote?: string | null;
  paymentTerms?: string | null;
  projectName?: string | null;
  projectCode?: string | null;
  clientName?: string | null;
  notes?: string | null;
  terms?: string | null;
  /** The taxable amount. */
  subtotal?: number | string | null;
  taxAmount: number | string;
  grandTotal: number | string;
  extraDiscount?: number | string | null;
  discountAmount?: number | string | null;
  tcsRate?: number | string | null;
  tcsAmount?: number | string | null;
  gstTdsRate?: number | string | null;
  gstTdsAmount?: number | string | null;
  incomeTdsRate?: number | string | null;
  incomeTdsAmount?: number | string | null;
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
  supplyType?: string | null;
  isRoundOff?: boolean | null;
  seriesId?: string | null;
  vendorId?: string;
  /** Set when the order came from a Purchase Indent: its vendor then stays. */
  purchaseIndentId?: string | null;
  billingAddressId?: string | null;
  billingLocationId?: string | null;
  shippingLocationId?: string | null;
  shippingAddressId?: string | null;
  vendor?: { id: string; name: string; gstin?: string | null; city?: string | null; state?: string | null } & Record<string, unknown> | null;
  billTo?: PlaceCopy;
  shipTo?: PlaceCopy;
  customFields?: Record<string, unknown> | null;
  items?: PurchaseOrderItem[];
  grns?: PurchaseOrderGrn[];
  auditLogs?: HistoryEntry[];
};

/** The cards' counts on the web's Purchase Orders screen (the list's kpiCounts, as `meta.stats`). */
export type PurchaseOrderStats = {
  all: number;
  draft: number;
  pendingApproval: number;
  approved: number;
  returned: number;
  partiallyReceived: number;
  received: number;
  cancelled: number;
  totalValue: number;
  pendingApprovalValue: number;
  toReceive: number;
  toReceiveValue: number;
  overdue: number;
  receivedValue: number;
  receivedValueRate: number | null;
};

export type PurchaseOrderFilters = { search?: string; status?: string; sort?: string; amount?: string; from?: string; to?: string; vendorId?: string };

const query = (params: Record<string, string | number | undefined>) => {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

/** One page of Purchase Orders and the cards' counts (GET /purchase-orders). */
export async function listPurchaseOrders(page: number, limit: number, f: PurchaseOrderFilters) {
  const { data, meta } = await apiWithMessage<PurchaseOrder[]>(`/purchase-orders${query({ page, limit, ...f })}`);
  return { rows: data, meta: meta as (Meta & { stats?: PurchaseOrderStats }) | null };
}

/** One Purchase Order with its lines, GRNs and history (GET /purchase-orders/:id). */
/** `excludeGrn`: the GRN being edited, so its own quantity is not counted as held. */
export const getPurchaseOrder = (id: string, excludeGrn?: string) => api<PurchaseOrder>(`/purchase-orders/${id}${excludeGrn ? `?excludeGrn=${excludeGrn}` : ''}`);

/** What a save sends (the web's payload); the server works out every amount. */
export type PurchaseOrderPayload = Record<string, unknown>;

/** Saves a new Purchase Order as a Draft, for approval, or approved (POST /purchase-orders). */
export const createPurchaseOrder = (body: PurchaseOrderPayload) => api<PurchaseOrder>('/purchase-orders', { method: 'POST', body });

/** Saves a Draft, a returned order or an approved one being edited (it goes for approval again): PUT /purchase-orders/:id. */
export const updatePurchaseOrder = (id: string, body: PurchaseOrderPayload) => api<PurchaseOrder>(`/purchase-orders/${id}`, { method: 'PUT', body });

/** Voids an order. The server refuses while a GRN made from it is live; `indentLines` says what happens to lines that came from indents. */
export const cancelPurchaseOrder = (id: string, reason: string, indentLines: string) =>
  api<PurchaseOrder>(`/purchase-orders/${id}/cancel`, { method: 'POST', body: { reason, indentLines } });

/** A cancelled order back as a Draft with the same number (only while the company's lock is off). */
export const restorePurchaseOrder = (id: string, reason: string) =>
  apiWithMessage<PurchaseOrder>(`/purchase-orders/${id}/restore`, { method: 'POST', body: reason ? { reason } : {} });

/** What stops Edit on an approved order (only the company's lock), asked before its form opens. */
export const purchaseOrderEditCheck = async (id: string) => (await api<{ block: EditBlock | null }>(`/purchase-orders/${id}/edit-check`)).block;

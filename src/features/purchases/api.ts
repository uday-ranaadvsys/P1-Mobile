import { PURCHASE_STATUS } from 'floman-shared/statuses';
import { api, apiWithMessage, type Meta } from '@/api/client';
import type { BillFile } from '@/features/grns/api';
import type { HistoryEntry } from '@/features/quotations/api';
import type { EditBlock } from '@/features/quotations/api';

type Person = { id?: string; firstName?: string | null; lastName?: string | null; email?: string | null };
type PlaceCopy = { text?: string } | null;

/** One line of a Purchase, as the list, the detail and a GRN receiving against it read it. */
export type PurchaseItem = {
  id: string;
  partId?: string | null;
  partName: string;
  partCode?: string | null;
  partDescription?: string | null;
  scopeOfWork?: string | null;
  hsn?: string | null;
  qty: number | string;
  freeQty?: number | string | null;
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
  indentRef?: string | null;
  /** The Purchase Indent shares this line holds (kept as they are when the Purchase is edited). */
  indentAllocations?: { indentItemId: string; allocatedQty: number | string }[];
};

/** A GRN made against the Purchase (its Linked documents). */
export type PurchaseGrn = { id?: string; grnNumber: string; grnDate?: string | null; status: string; paymentStatus?: string | null; grandTotal?: number | string; vendorInvoiceNumber?: string | null };

/** A Purchase (the vendor's bill booked before the goods come in). Money arrives as text or numbers. */
export type Purchase = {
  id: string;
  purchaseNumber: string;
  status: string;
  purchaseDate?: string | null;
  vendorId?: string;
  vendorBillNumber?: string | null;
  vendorBillDate?: string | null;
  paymentTerms?: string | null;
  projectName?: string | null;
  projectCode?: string | null;
  clientName?: string | null;
  notes?: string | null;
  terms?: string | null;
  /** The taxable amount. */
  subtotal?: number | string | null;
  taxAmount?: number | string | null;
  grandTotal?: number | string | null;
  extraDiscount?: number | string | null;
  discountAmount?: number | string | null;
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
  createdAt?: string;
  vendor?: ({ id: string; name: string; gstin?: string | null; city?: string | null; state?: string | null } & Record<string, unknown>) | null;
  billTo?: PlaceCopy;
  shipTo?: PlaceCopy;
  customFields?: Record<string, unknown> | null;
  items?: PurchaseItem[];
  grns?: PurchaseGrn[];
  auditLogs?: HistoryEntry[];
} & Record<string, unknown>;

/** The cards' counts on the web's Purchases screen (the list's `stats`). */
export type PurchaseStats = {
  total: number;
  draft: number;
  pendingApproval: number;
  returned: number;
  approved: number;
  partiallyReceived: number;
  received: number;
  cancelled: number;
  totalValue: number;
  toReceive: number;
  toReceiveValue: number;
};

export type PurchaseFilters = { search?: string; status?: string; sort?: string; amount?: string; from?: string; to?: string; vendorId?: string };

const query = (params: Record<string, string | number | undefined>) => {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

/** One page of Purchases and the cards' counts (GET /purchases). */
export async function listPurchases(page: number, limit: number, f: PurchaseFilters) {
  const { data, meta } = await apiWithMessage<Purchase[]>(`/purchases${query({ page, limit, ...f })}`);
  return { rows: data, meta: meta as (Meta & { stats?: PurchaseStats }) | null };
}

/** Purchases goods can be received against: approved, or partly received. */
const RECEIVABLE: string[] = [PURCHASE_STATUS.APPROVED, PURCHASE_STATUS.PARTIALLY_RECEIVED];

/** Receivable Purchases (GET /purchases), searched on the server as you type. */
export async function listReceivablePurchases(search: string) {
  const rows = await api<Purchase[]>(`/purchases${query({ limit: 100, search: search || undefined })}`);
  return rows.filter((p) => RECEIVABLE.includes(p.status));
}

/** One Purchase with its lines, GRNs and history (GET /purchases/:id); `excludeGrn`: the GRN being edited, so its own quantity is not counted as held. */
export const getPurchase = (id: string, excludeGrn?: string) => api<Purchase>(`/purchases/${id}${excludeGrn ? `?excludeGrn=${excludeGrn}` : ''}`);

/** What a save sends (the web's payload); the server works out every amount. */
export type PurchasePayload = Record<string, unknown>;

/** Saves a new Purchase as a Draft, for approval, or approved (POST /purchases). */
export const createPurchase = (body: PurchasePayload) => api<Purchase>('/purchases', { method: 'POST', body });

/** Saves a Draft, a returned Purchase or an approved one being edited (it goes for approval again): PUT /purchases/:id. */
export const updatePurchase = (id: string, body: PurchasePayload) => api<Purchase>(`/purchases/${id}`, { method: 'PUT', body });

/** Voids a Purchase. The server refuses while a GRN made from it is live; `indentLines` says what happens to lines that came from indents. */
export const cancelPurchase = (id: string, reason: string, indentLines: string) => api<Purchase>(`/purchases/${id}/cancel`, { method: 'POST', body: { reason, indentLines } });

/** A cancelled Purchase back as a Draft with the same number (only while the company's lock is off). */
export const restorePurchase = (id: string, reason: string) => apiWithMessage<Purchase>(`/purchases/${id}/restore`, { method: 'POST', body: reason ? { reason } : {} });

/** What stops Edit on an approved Purchase (only the company's lock), asked before its form opens. */
export const purchaseEditCheck = async (id: string) => (await api<{ block: EditBlock | null }>(`/purchases/${id}/edit-check`)).block;

/** Is the vendor's bill number already on another Purchase or GRN that financial year? The server's message, or null. */
export async function checkPurchaseBill(params: { vendorId: string; billNumber: string; billDate: string; excludePurchaseId?: string }): Promise<string | null> {
  const data = await api<{ message?: string | null } | null>(`/purchases/vendor-bill${query({ ...params })}`);
  return data?.message ?? null;
}

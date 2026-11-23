import { api, apiWithMessage, type Meta } from '@/api/client';
import type { NoteDeductionSource } from 'floman-shared/taxDeduction';
import type { NoteLine } from 'floman-shared/notes';
import type { EditBlock, HistoryEntry } from '@/features/quotations/api';

type Person = { id?: string; firstName?: string | null; lastName?: string | null; email?: string | null };

/** The GRN a Debit Note is against (as the server sends it). */
export type DebitNoteSource = {
  id: string;
  grnNumber: string;
  grnDate?: string | null;
  vendorInvoiceNumber?: string | null;
  vendorInvoiceDate?: string | null;
  grandTotal: number | string;
  balanceAmount?: number | string | null;
  status?: string;
  extraDiscount?: number | string | null;
  isRoundOff?: boolean | null;
  /** Our location the GRN is billed to: the note is numbered by that location's series. */
  billingLocationId?: string | null;
  vendor?: { id: string; name: string; gstin?: string | null; city?: string | null; state?: string | null } | null;
};

export type DebitNoteItem = {
  id: string;
  grnItemId: string | null;
  partName: string;
  partCode?: string | null;
  hsn?: string | null;
  qty: number | string;
  uom: string;
  unitPrice: number | string;
  discount?: number | string | null;
  discountType?: string | null;
  taxRate: number | string;
  taxableAmount?: number | string | null;
  taxAmount?: number | string | null;
  totalAmount?: number | string | null;
};

/** A link of the note's leftover amount to a document (its own GRN, or another one). */
export type DebitNoteLink = { id: string; grnId: string | null; amount: number | string; grn?: { id: string; grnNumber: string } | null };

/** A Debit Note as the list and its detail read it (server: AdjustmentNote, type DEBIT). */
export type DebitNote = {
  id: string;
  noteNumber: string;
  seriesId?: string | null;
  status: string;
  grnId: string | null;
  vendorId: string;
  noteDate: string;
  reason: string;
  partyNoteNumber?: string | null;
  partyNoteDate?: string | null;
  notes?: string | null;
  terms?: string | null;
  approvalRemarks?: string | null;
  returnedAt?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  approvedAt?: string | null;
  editedAt?: string | null;
  editedBy?: Person | null;
  subtotal: number | string;
  discountAmount?: number | string | null;
  extraDiscount?: number | string | null;
  taxAmount: number | string;
  isRoundOff?: boolean | null;
  roundOffAmount?: number | string | null;
  grandTotal: number | string;
  appliedAmount?: number | string | null;
  refundedAmount?: number | string | null;
  unappliedAmount?: number | string | null;
  customFields?: Record<string, unknown> | null;
  createdAt: string;
  vendor?: { id: string; name: string; gstin?: string | null; city?: string | null; state?: string | null } | null;
  grn?: DebitNoteSource | null;
  items?: DebitNoteItem[];
  allocations?: DebitNoteLink[];
  refunds?: { id: string; amount: number | string; payment: { id: string; paymentDate: string; mode: string; referenceNo?: string | null } }[];
  createdBy?: Person | null;
  approvedBy?: Person | null;
  cancelledBy?: Person | null;
  auditLogs?: HistoryEntry[];
};

/** The cards' counts on the web's Debit Notes screen (the list's `meta.stats`). */
export type DebitNoteStats = {
  total: number;
  draft: number;
  pendingApproval: number;
  returned: number;
  issued: number;
  cancelled: number;
  totalValue: number;
  unlinked: number;
  unused: number;
  pendingApprovalValue: number;
};

export type DebitNoteFilters = { search?: string; status?: string; unused?: boolean; sort?: string; amount?: string; from?: string; to?: string; vendorId?: string };

const query = (params: Record<string, string | number | undefined>) => {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

/** One page of Debit Notes and the cards' counts (GET /debit-notes). */
export async function listDebitNotes(page: number, limit: number, f: DebitNoteFilters) {
  const { unused, ...rest } = f;
  const { data, meta } = await apiWithMessage<DebitNote[]>(`/debit-notes${query({ page, limit, ...rest, unused: unused ? 'true' : undefined })}`);
  return { rows: data, meta: meta as (Meta & { stats?: DebitNoteStats }) | null };
}

/** One Debit Note with its lines, links, refunds and history (GET /debit-notes/:id). */
export const getDebitNote = (id: string) => api<DebitNote>(`/debit-notes/${id}`);

/** A GRN a note can be raised against, for the picker (GET /debit-notes/sources). */
export type DebitNoteSourceChoice = { id: string; number: string; reference: string | null; date: string | null; amount: number | string; partyId: string; partyName: string };
export const listSources = (search: string) => api<DebitNoteSourceChoice[]>(`/debit-notes/sources${query({ search: search || undefined })}`);

/** The GRN and its lines with what is still left to take off each (not counting the note being edited), and its TDS / TCS. */
export type SourceLines = { source: DebitNoteSource; lines: NoteLine[]; deductions?: Partial<Record<'TCS' | 'GST_TDS' | 'TDS', NoteDeductionSource>> };
export const getSourceLines = (sourceId: string, noteId?: string) => api<SourceLines>(`/debit-notes/source-lines${query({ sourceId, noteId })}`);

export type DebitNotePayload = Record<string, unknown>;

/** Saves a new Debit Note as a Draft, for approval, or approved (POST /debit-notes). */
export const createDebitNote = (body: DebitNotePayload) => apiWithMessage<DebitNote>('/debit-notes', { method: 'POST', body });

/** Saves a Draft, waiting or returned note, or an approved one being edited (it goes for approval again): PUT /debit-notes/:id. */
export const updateDebitNote = (id: string, body: DebitNotePayload) => apiWithMessage<DebitNote>(`/debit-notes/${id}`, { method: 'PUT', body });

export const cancelDebitNote = (id: string, reason: string) => apiWithMessage<DebitNote>(`/debit-notes/${id}/cancel`, { method: 'POST', body: { reason } });

/** A cancelled note back as a Draft with the same number (only while the company's lock is off). */
export const restoreDebitNote = (id: string, reason: string) => apiWithMessage<DebitNote>(`/debit-notes/${id}/restore`, { method: 'POST', body: reason ? { reason } : {} });

/** What stops Edit on an approved note (the company's lock, or money refunded from it). */
export const debitNoteEditCheck = async (id: string) => (await api<{ block: EditBlock | null }>(`/debit-notes/${id}/edit-check`)).block;

import { api, apiWithMessage } from '@/api/client';
import type { OpenDocument, PartyCredit, PaymentRecord } from 'floman-shared/payments';

/** A payment and what it settles, as the server sends them (shared with the web). */
export type { PaymentAllocation, PaymentRecord } from 'floman-shared/payments';

/** One payment with the documents it settles (GET /payments/:id). */
export const getPayment = (id: string) => api<PaymentRecord>(`/payments/${id}`);

/** Voids a payment: what it settled is due again (POST /payments/:id/cancel; the reason is required). */
export const cancelPayment = (id: string, reason: string) => apiWithMessage<PaymentRecord>(`/payments/${id}/cancel`, { method: 'POST', body: { reason } });

export type { OpenDocument };

/** What a payment of this type to this party can settle: its open invoices (Receive) or GRNs (Pay) and opening balance; for a refund, the notes with an amount left. */
export const listOpenDocuments = (type: string, vendorId: string, refund: boolean) =>
  api<OpenDocument[]>(`/payments/open-documents?${new URLSearchParams({ type, vendorId, ...(refund ? { refund: 'true' } : {}) })}`);

/** The party's advance and credit (unlinked payments, approved note leftovers), oldest first: used before new money. */
export const listCredits = (type: string, vendorId: string) => api<PartyCredit[]>(`/payments/credits?${new URLSearchParams({ type, vendorId })}`);

/** Records a payment (POST /payments). With amount 0 only the advance and credit are adjusted: `data` is then null. */
export const createPayment = (body: Record<string, unknown>) => apiWithMessage<PaymentRecord | null>('/payments', { method: 'POST', body });

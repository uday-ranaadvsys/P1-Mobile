import { QUOTATION_STATUS } from 'floman-shared/statuses';
import { fileSafe } from '@/lib/fileName';
import { formatMoney } from '@/lib/format';
import type { Quotation } from './api';

/**
 * A Quotation's status as people read it (the web's QUOTATION_STATUS_LABEL; the saved codes stay as they are).
 * Copied here until the web moves it into shared/.
 */
export const STATUS_LABEL: Record<string, string> = {
  [QUOTATION_STATUS.DRAFT]: 'Draft',
  [QUOTATION_STATUS.PENDING_APPROVAL]: 'Waiting for approval',
  [QUOTATION_STATUS.APPROVER_RETURNED]: 'Approver Returned',
  [QUOTATION_STATUS.APPROVER_ACCEPTED]: 'Approved',
  [QUOTATION_STATUS.CUSTOMER_PARTIALLY_ACCEPTED]: 'PO Partially Received',
  [QUOTATION_STATUS.CUSTOMER_ACCEPTED]: 'PO Received',
  [QUOTATION_STATUS.CUSTOMER_REJECTED]: 'Customer Rejected',
  [QUOTATION_STATUS.CANCELLED]: 'Cancelled',
};
export const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

/** A status code in words ("PENDING_APPROVAL" → "Pending approval"), for the linked documents. */
export const statusInWords = (code: string) => code.charAt(0) + code.slice(1).replace(/_/g, ' ').toLowerCase();

/** Quotes the customer has answered, or that were cancelled: how long they stay valid no longer matters. */
export const CLOSED_STATUSES: string[] = [
  QUOTATION_STATUS.CUSTOMER_ACCEPTED,
  QUOTATION_STATUS.CUSTOMER_PARTIALLY_ACCEPTED,
  QUOTATION_STATUS.CUSTOMER_REJECTED,
  QUOTATION_STATUS.CANCELLED,
];

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "11 days", "today" or "expired": how long an open quotation is still valid. */
export function daysLeft(date: string): string {
  const left = Math.round((startOfDay(new Date(date)) - startOfDay(new Date())) / DAY_MS);
  return left < 0 ? 'expired' : left === 0 ? 'today' : `${left} ${left === 1 ? 'day' : 'days'}`;
}

export const quotationDate = (q: Pick<Quotation, 'issueDate' | 'quotationDate'>) => q.issueDate || q.quotationDate;

export const money = (value: number | string | null | undefined) => formatMoney(value);

/** Who it is by, as a name or email. */
export const personName = (p?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) =>
  p ? [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.email || null : null;

/** A document's Bill To / Ship To as its details show them: the copy it kept when it was last saved. */
export const addressCopy = (copy: Quotation['billTo']) => (copy && typeof copy.text === 'string' && copy.text.trim() ? copy.text : null);

/** The PDF's file name as the receiver sees it: Quotation_QT_26-27_0007.pdf (a "/" or ":" in the number would break a file name). */
export const pdfName = (q: { quotationNumber: string }) => `Quotation_${fileSafe(q.quotationNumber)}.pdf`;

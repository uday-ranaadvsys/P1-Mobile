import { PAYMENT_STATUS, GRN_STATUS, PAYABLE_GRN_STATUSES } from 'floman-shared/statuses';
import { fileSafe } from '@/lib/fileName';
import { daysAgo } from '@/lib/format';
import type { BillFile, Grn } from './api';

/** Unpaid or partly paid, asked for together (the "To pay" pill), as the web does. */
export const TO_PAY = `${PAYMENT_STATUS.UNPAID},${PAYMENT_STATUS.PARTIALLY_PAID}`;

/** The pills that filter by how far a GRN is paid (the server's paymentStatus), not by its stage. */
export const PAYMENT_FILTERS: string[] = [TO_PAY, PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.PAID];

/**
 * A GRN's one Status as people read it (the web's STATUS_SHOWN / STATUS_FILTER_OPTIONS in GRNs.tsx; the saved codes
 * stay as they are): before approval the stage, once approved or received how far it is paid. Copied here until the
 * web moves it into shared/.
 */
export const STATUS_LABEL: Record<string, string> = {
  [GRN_STATUS.DRAFT]: 'Draft',
  [GRN_STATUS.PENDING_APPROVAL]: 'Waiting for approval',
  [GRN_STATUS.RETURNED]: 'Returned',
  [TO_PAY]: 'To pay',
  [PAYMENT_STATUS.UNPAID]: 'Unpaid',
  [PAYMENT_STATUS.PARTIALLY_PAID]: 'Partly paid',
  [PAYMENT_STATUS.PAID]: 'Paid',
  [GRN_STATUS.CANCELLED]: 'Cancelled',
};
export const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

/** The stage of an approved or received GRN, shown beside its payment status. */
export const STAGE_WORD: Record<string, string> = { [GRN_STATUS.APPROVED]: 'Approved', [GRN_STATUS.RECEIVED]: 'Received' };

/** Approved or received: a payment can settle it. */
export const isPayable = (grn: Pick<Grn, 'status'>) => PAYABLE_GRN_STATUSES.includes(grn.status);

/** The one Status: approved / received ones by how far they are paid, the rest by their stage. */
export const shownStatus = (grn: Pick<Grn, 'status' | 'paymentStatus'>) => (isPayable(grn) ? grn.paymentStatus || PAYMENT_STATUS.UNPAID : grn.status);

/** Still owed and its due date has passed: how many days late (0 when not overdue). */
export const daysOverdue = (grn: Pick<Grn, 'status' | 'paymentStatus' | 'dueDate'>) =>
  isPayable(grn) && grn.paymentStatus !== PAYMENT_STATUS.PAID && grn.dueDate ? Math.max(0, daysAgo(grn.dueDate)) : 0;

/** "3 days overdue" / "1 day overdue". */
export const overdueText = (days: number) => `${days} ${days === 1 ? 'day' : 'days'} overdue`;

/** Its scanned bill: the files attached, or the one link. */
export const billFiles = (grn: Pick<Grn, 'billAttachmentUrl' | 'attachmentPaths'>): { url: string; name: string }[] => {
  if (Array.isArray(grn.attachmentPaths) && grn.attachmentPaths.length > 0) {
    return grn.attachmentPaths.map((att: BillFile | string) => ({
      url: typeof att === 'string' ? att : att.url || att.path || '',
      name: (typeof att === 'string' ? att.split('/').pop() : att.originalName || att.filename) || 'Scanned bill',
    }));
  }
  return grn.billAttachmentUrl ? [{ url: grn.billAttachmentUrl, name: grn.billAttachmentUrl.split('/').pop() || 'Scanned bill' }] : [];
};

/**
 * The PDF's file name: the GRN's own number (GRN∕26-27∕0004.pdf, the slash as a look-alike, see fileSafe).
 * "GRN_" is only put in front when the number does not start with "GRN" already.
 */
export const pdfName = (grn: { grnNumber: string }) => {
  const safe = fileSafe(grn.grnNumber);
  return `${/^GRN/i.test(safe) ? '' : 'GRN_'}${safe}.pdf`;
};

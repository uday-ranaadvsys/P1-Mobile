import { GRN_STATUS, PO_STATUS, RECEIVABLE_PO_STATUSES } from 'floman-shared/statuses';
import { daysAgo } from '@/lib/format';
import { fileSafe } from '@/lib/fileName';
import type { PurchaseOrder } from './api';

/** Approved and not fully received, asked for together (the "To receive" pill), as the web does. */
export const TO_RECEIVE = RECEIVABLE_PO_STATUSES.join(',');

/**
 * A Purchase Order's status as people read it (the web's STATUS_FILTER_OPTIONS in PurchaseOrders.tsx; the saved codes
 * stay as they are). Copied here until the web moves it into shared/.
 */
export const STATUS_LABEL: Record<string, string> = {
  [PO_STATUS.DRAFT]: 'Draft',
  [PO_STATUS.PENDING_APPROVAL]: 'Waiting for approval',
  [PO_STATUS.RETURNED]: 'Returned',
  [TO_RECEIVE]: 'To receive',
  [PO_STATUS.APPROVED]: 'Approved',
  [PO_STATUS.PARTIALLY_RECEIVED]: 'Partly received',
  [PO_STATUS.RECEIVED]: 'Received',
  [PO_STATUS.CANCELLED]: 'Cancelled',
};
export const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

/**
 * The PDF's file name: the order's own number (PO∕26-27∕0006.pdf, the slash as a look-alike, see fileSafe).
 * "PO_" is only put in front when the number does not start with "PO" already.
 */
export const pdfName = (po: { poNumber: string }) => {
  const safe = fileSafe(po.poNumber);
  return `${/^PO/i.test(safe) ? '' : 'PO_'}${safe}.pdf`;
};

/** Days past the due date while goods are still to come (0 when not late). */
export const daysLate = (po: Pick<PurchaseOrder, 'status' | 'deliveryDueDate'>) =>
  po.deliveryDueDate && RECEIVABLE_PO_STATUSES.includes(po.status) ? Math.max(0, daysAgo(po.deliveryDueDate)) : 0;

/** "3 days late" / "1 day late". */
export const lateText = (days: number) => `${days} ${days === 1 ? 'day' : 'days'} late`;

/** Its GRNs that are not cancelled (drafts too): its Cancel waits for them, and its vendor stays. */
export const liveGrns = (po: Pick<PurchaseOrder, 'grns'>): string[] =>
  (po.grns ?? []).filter((g) => g.status !== GRN_STATUS.CANCELLED).map((g) => g.grnNumber).filter(Boolean);

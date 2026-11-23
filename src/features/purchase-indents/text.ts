import { PURCHASE_INDENT_STATUS } from 'floman-shared/statuses';
import { daysAgo } from '@/lib/format';
import type { PurchaseIndent } from './api';

/**
 * A Purchase Indent's status as people read it (the web's STATUS_FILTER_OPTIONS in PurchaseIndents.tsx; Approved shows as
 * "Converted to PO"). Copied here until the web moves it into shared/.
 */
export const STATUS_LABEL: Record<string, string> = {
  [PURCHASE_INDENT_STATUS.DRAFT]: 'Draft',
  [PURCHASE_INDENT_STATUS.PENDING_APPROVAL]: 'Waiting for approval',
  [PURCHASE_INDENT_STATUS.RETURNED]: 'Returned',
  [PURCHASE_INDENT_STATUS.CONVERTED]: 'Converted to PO',
  [PURCHASE_INDENT_STATUS.APPROVED]: 'Converted to PO',
  [PURCHASE_INDENT_STATUS.CANCELLED]: 'Cancelled',
};
export const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

/** Draft, returned or waiting: the form still opens (a converted one's order is changed on its PO). */
export const EDITABLE: string[] = [PURCHASE_INDENT_STATUS.DRAFT, PURCHASE_INDENT_STATUS.RETURNED, PURCHASE_INDENT_STATUS.PENDING_APPROVAL];
/** The purchaser may cancel it until it is approved. */
export const CANCELLABLE: string[] = EDITABLE;

/** Days past the delivery due date while it is not converted or cancelled (0 when not late). */
export const daysLate = (pr: Pick<PurchaseIndent, 'status' | 'deliveryDueDate'>) =>
  pr.deliveryDueDate && EDITABLE.includes(pr.status) ? Math.max(0, daysAgo(pr.deliveryDueDate)) : 0;

/** The Purchase Order made from it (the first that is not cancelled, else the first). */
export const poOf = (pr: Pick<PurchaseIndent, 'purchaseOrders'>) => pr.purchaseOrders?.find((o) => o.status !== 'CANCELLED') ?? pr.purchaseOrders?.[0] ?? null;

/** The Indents its lines order, each once (their numbers, for "Made from Indents"). */
export const sourceIndents = (pr: Pick<PurchaseIndent, 'items'>) => {
  const all = (pr.items ?? []).flatMap((i) => i.indentAllocations ?? []).map((a) => a.indentItem?.indent).filter((x): x is { id: string; indentNumber: string } => Boolean(x));
  return [...new Map(all.map((x) => [x.id, x])).values()];
};

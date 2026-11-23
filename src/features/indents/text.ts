import { INDENT_PRIORITY } from 'floman-shared/constants';
import { INDENT_ITEM_STATUS, INDENT_STATUS } from 'floman-shared/statuses';
import { daysAgo } from '@/lib/format';
import type { Indent, IndentItem } from './api';

/** Submitted or partly ordered: lines still to order (the "Waiting to be ordered" pill), as the web asks for them together. */
export const WAITING_TO_ORDER = `${INDENT_STATUS.SUBMITTED},${INDENT_STATUS.PARTIALLY_ORDERED}`;
/** Ordered or partly received: goods still to come. */
export const GOODS_AWAITED = `${INDENT_STATUS.ORDERED},${INDENT_STATUS.PARTIALLY_RECEIVED}`;

/** With the requester: not taken further while it is a draft, or returned to them. */
export const WITH_REQUESTER: string[] = [INDENT_STATUS.DRAFT, INDENT_STATUS.RETURNED];
export const WAITING_STATUSES: string[] = [INDENT_STATUS.SUBMITTED, INDENT_STATUS.PARTIALLY_ORDERED];

/**
 * An Indent's status as people read it (the web's STATUS_FILTER_OPTIONS in Indents.tsx; the saved codes stay as they are).
 * Copied here until the web moves it into shared/.
 */
export const STATUS_LABEL: Record<string, string> = {
  [INDENT_STATUS.DRAFT]: 'Draft',
  [WAITING_TO_ORDER]: 'Waiting to be ordered',
  [INDENT_STATUS.SUBMITTED]: 'Submitted',
  [INDENT_STATUS.RETURNED]: 'Returned',
  [INDENT_STATUS.PARTIALLY_ORDERED]: 'Partially Ordered',
  [GOODS_AWAITED]: 'Ordered, goods awaited',
  [INDENT_STATUS.ORDERED]: 'Ordered',
  [INDENT_STATUS.PARTIALLY_RECEIVED]: 'Partly received',
  [INDENT_STATUS.RECEIVED]: 'Received',
  [INDENT_STATUS.CANCELLED]: 'Cancelled',
};
export const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

/** The priorities and their words (the web's PRIORITY_OPTIONS: "Normal" for the middle one). */
export const PRIORITY_CHOICES = [
  { value: INDENT_PRIORITY.URGENT, label: 'Urgent' },
  { value: INDENT_PRIORITY.HIGH, label: 'High' },
  { value: INDENT_PRIORITY.MEDIUM, label: 'Normal' },
  { value: INDENT_PRIORITY.LOW, label: 'Low' },
];
export const priorityLabel = (priority: string) => PRIORITY_CHOICES.find((o) => o.value === priority)?.label ?? priority;
/** Urgent and high stand out; the rest is plain. */
export const isPressing = (priority: string) => priority === INDENT_PRIORITY.URGENT || priority === INDENT_PRIORITY.HIGH;

/** A line that is cancelled is left out of every count and total. */
export const liveLines = (items: IndentItem[] = []) => items.filter((i) => i.status !== INDENT_ITEM_STATUS.CANCELLED);

/** A line's estimated total: the saved one, or quantity × estimated rate. */
export const lineValue = (it: Pick<IndentItem, 'qty' | 'estimatedTotal' | 'estimatedUnitPrice'>) =>
  Number(it.estimatedTotal) || (Number(it.qty) || 0) * (Number(it.estimatedUnitPrice) || 0);

/** The estimated value of an Indent: its live lines' estimated totals. */
export const estimatedValue = (indent: Pick<Indent, 'items'>) => liveLines(indent.items).reduce((sum, it) => sum + lineValue(it), 0);

/** Days past the required-by date while the goods are not all in (0 when not late). */
export const daysLate = (indent: Pick<Indent, 'status' | 'requiredByDate'>) =>
  indent.requiredByDate && indent.status !== INDENT_STATUS.RECEIVED && indent.status !== INDENT_STATUS.CANCELLED ? Math.max(0, daysAgo(indent.requiredByDate)) : 0;

/** "3 days late" / "1 day late". */
export const lateText = (days: number) => `${days} ${days === 1 ? 'day' : 'days'} late`;

/** Any line has an ordered quantity: its Cancel waits (cancel the Purchase Indent / PO / Purchase first). */
export const hasOrders = (indent: Pick<Indent, 'items'>) => (indent.items ?? []).some((i) => Number(i.orderedQty || 0) > 0);

/** The documents (Purchases, Purchase Orders, Purchase Indents) covering a line; cancelled ones are left out. */
export const coveredBy = (item: IndentItem) => [
  ...(item.purchaseAllocations ?? [])
    .filter((a) => a.purchaseItem?.purchase && a.purchaseItem.purchase.status !== 'CANCELLED')
    .map((a) => ({ kind: 'Purchase', number: a.purchaseItem!.purchase!.purchaseNumber, id: a.purchaseItem!.purchase!.id, route: '/purchase/purchases/[id]' as const })),
  ...(item.poAllocations ?? [])
    .filter((a) => a.poItem?.purchaseOrder && a.poItem.purchaseOrder.status !== 'CANCELLED')
    .map((a) => ({ kind: 'Purchase Order', number: a.poItem!.purchaseOrder!.poNumber, id: a.poItem!.purchaseOrder!.id, route: '/purchase/purchase-orders/[id]' as const })),
  ...(item.prAllocations ?? [])
    .filter((a) => a.prItem?.purchaseIndent && a.prItem.purchaseIndent.status !== 'CANCELLED')
    .map((a) => ({ kind: 'Purchase Indent', number: a.prItem!.purchaseIndent!.prNumber, id: a.prItem!.purchaseIndent!.id, route: '/purchase/purchase-indents/[id]' as const })),
];

/** The posted GRNs that delivered a line (through its PO / Purchase items), each once. */
export const receivedThrough = (item: IndentItem) => {
  const grns = [...(item.poAllocations ?? []).flatMap((a) => a.poItem?.grnItems ?? []), ...(item.purchaseAllocations ?? []).flatMap((a) => a.purchaseItem?.grnItems ?? [])].map((g) => g.grn);
  return [...new Map(grns.map((g) => [g.id, g])).values()];
};

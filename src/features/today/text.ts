import { AUDIT_ACTIONS, CALIBRATION_TEXT, PAYMENT_TYPE, TODAY_GROUP, TODAY_ITEM_KIND } from 'floman-shared/constants';
import { PO_STATUS, PURCHASE_STATUS, SO_STATUS } from 'floman-shared/statuses';
import { DOCUMENT_NAMES, DOCUMENT_TYPE, type DocumentType } from 'floman-shared/documentTypes';
import type { DoneEntry, TodayGroupKey, TodayItem } from '@/features/today/api';
import { daysAgo, formatDate, formatDayMonth, formatINR } from '@/lib/format';

/**
 * How Today words each item. A port of the web's client/src/features/today/config.ts (the wording
 * only: badge, detail line, title). Keep it the same as the web; the web chat may move it to shared/.
 */

/** "40 min ago", "3 h ago", "yesterday", "4 days ago". */
export function since(iso: string, now = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return minutes <= 1 ? 'just now' : `${minutes} min ago`;
  const days = daysAgo(iso, now);
  if (days === 0) return `${Math.round(minutes / 60)} h ago`;
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** How many whole days ago it was (0 for today, or for a date still to come). */
const daysPast = (iso: string | null) => (iso ? Math.max(0, daysAgo(iso)) : 0);
const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;

/** The badge beside an item: how late it is (late), or how long it has waited (waiting). */
export function badgeOf(group: TodayGroupKey, item: TodayItem): { text: string; tone: 'late' | 'waiting' } | null {
  const past = daysPast(item.date);
  switch (group) {
    case TODAY_GROUP.COLLECT:
    case TODAY_GROUP.PAY:
      return past > 0 ? { text: `${days(past)} overdue`, tone: 'late' } : null;
    case TODAY_GROUP.RECEIVE:
      return item.kind !== DOCUMENT_TYPE.PURCHASE && past > 0 ? { text: `${days(past)} late`, tone: 'late' } : null;
    case TODAY_GROUP.BILL:
      return past > 0 ? { text: `${days(past)} late`, tone: 'late' } : null;
    case TODAY_GROUP.CALIBRATE:
      return !item.date ? { text: CALIBRATION_TEXT.NOT_CALIBRATED, tone: 'late' } : past > 0 ? { text: `${days(past)} overdue`, tone: 'late' } : null;
    case TODAY_GROUP.INDENTS:
      return past > 0 ? { text: `${days(past)} waiting`, tone: 'waiting' } : null;
    default:
      return null;
  }
}

/** "valid till today / tomorrow / 08 Oct". */
const validTill = (iso: string | null) => {
  if (!iso) return '';
  const left = -daysAgo(iso);
  return `valid till ${left <= 0 ? 'today' : left === 1 ? 'tomorrow' : formatDayMonth(iso)}`;
};

const labelOf = (item: TodayItem) => (item.kind === TODAY_ITEM_KIND.INSTRUMENT ? '' : DOCUMENT_NAMES[item.kind as DocumentType] ?? '');

/** The line under the item's title: why it is on the list. */
export function detailOf(group: TodayGroupKey, item: TodayItem): string {
  switch (group) {
    case TODAY_GROUP.FIX:
      return [`Returned${item.by ? ` by ${item.by}` : ''}`, item.note && `“${item.note}”`].filter(Boolean).join(': ');
    case TODAY_GROUP.APPROVE:
      return [labelOf(item), [item.by && `from ${item.by}`, item.date && since(item.date)].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    case TODAY_GROUP.COLLECT:
      return daysPast(item.date) > 0 ? `Was due ${formatDate(item.date)}` : 'Due today';
    case TODAY_GROUP.PAY:
      return [item.note ? `Vendor bill ${item.note}` : null, daysPast(item.date) > 0 ? null : 'Due today'].filter(Boolean).join(' · ') || `Was due ${formatDate(item.date)}`;
    case TODAY_GROUP.RECEIVE: {
      const partly = item.status === PO_STATUS.PARTIALLY_RECEIVED || item.status === PURCHASE_STATUS.PARTIALLY_RECEIVED;
      const when = item.kind === DOCUMENT_TYPE.PURCHASE ? 'Bill in hand, goods not received' : daysPast(item.date) > 0 ? `Expected ${formatDate(item.date)}` : 'Expected today';
      return [when, partly && 'partly received'].filter(Boolean).join(' · ');
    }
    case TODAY_GROUP.BILL:
      return [item.date && `Delivery was due ${formatDate(item.date)}`, item.status === SO_STATUS.PARTIALLY_INVOICED ? 'partly invoiced' : 'nothing invoiced yet'].filter(Boolean).join(' · ');
    case TODAY_GROUP.CALIBRATE:
      return [!item.date ? CALIBRATION_TEXT.NOT_CALIBRATED_YET : daysPast(item.date) > 0 ? CALIBRATION_TEXT.wasValidTill(formatDate(item.date)) : CALIBRATION_TEXT.validTill(formatDate(item.date)), item.note].filter(Boolean).join(' · ');
    case TODAY_GROUP.FOLLOW_UP:
      return `${labelOf(item)} ${validTill(item.date)} · not taken further`;
    case TODAY_GROUP.INDENTS:
      return [item.lines != null && `${item.lines} ${item.lines === 1 ? 'line' : 'lines'}`, item.by && `raised by ${item.by}`, item.date && formatDate(item.date)].filter(Boolean).join(' · ');
    case TODAY_GROUP.DRAFTS:
      return item.date ? `Last edited ${formatDate(item.date)}` : '';
  }
}

/** The item's two title lines: its number (a draft by its kind: a draft's number is only temporary) and its party. */
export function headOf(group: TodayGroupKey, item: TodayItem): { top: string; party: string | null } {
  return { top: group === TODAY_GROUP.DRAFTS ? `${labelOf(item)} draft` : item.number, party: item.party };
}

/** What the user did to a document, as "Done today" says it. */
const DONE_VERB: Record<string, string> = {
  [AUDIT_ACTIONS.APPROVED]: 'approved',
  [AUDIT_ACTIONS.APPROVER_ACCEPTED]: 'approved',
  [AUDIT_ACTIONS.ISSUED]: 'issued',
  [AUDIT_ACTIONS.RETURNED]: 'returned',
  [AUDIT_ACTIONS.APPROVER_RETURNED]: 'returned',
  [AUDIT_ACTIONS.REJECTED]: 'rejected',
  [AUDIT_ACTIONS.SUBMITTED_FOR_APPROVAL]: 'sent for approval',
  [AUDIT_ACTIONS.SUBMITTED]: 'submitted',
  [AUDIT_ACTIONS.RESUBMITTED]: 'sent again',
  [AUDIT_ACTIONS.CONVERTED_FROM_PO]: 'made',
  [AUDIT_ACTIONS.RECEIVED_AGAINST_PURCHASE]: 'made',
  [AUDIT_ACTIONS.CONVERTED_FROM_QUOTATION]: 'made',
  [AUDIT_ACTIONS.CONVERTED_FROM_SO]: 'made',
  [AUDIT_ACTIONS.CONVERTED_FROM_PROFORMA]: 'made',
};

/** "SO/26-27/0031 approved", "₹42,000 received from Nilgiri Castings". */
export function doneText(entry: DoneEntry): string {
  if (entry.kind === null) {
    const amount = formatINR(entry.amount ?? 0);
    return entry.paymentType === PAYMENT_TYPE.RECEIPT ? `${amount} received from ${entry.party}` : `${amount} paid to ${entry.party}`;
  }
  return `${entry.number} ${DONE_VERB[entry.action] ?? entry.action.replace(/_/g, ' ').toLowerCase()}`;
}

/**
 * The button a Today item gets, in the web's words (client features/today/config.ts actionOf). Only Review
 * works on the phone so far; the others say "Coming soon" until their flows are built.
 */
export function actionOf(group: TodayGroupKey): { label: string; works: boolean } {
  switch (group) {
    case TODAY_GROUP.FIX:
      return { label: 'Fix', works: false };
    case TODAY_GROUP.APPROVE:
      return { label: 'Review', works: true };
    case TODAY_GROUP.COLLECT:
      return { label: 'Record payment', works: false };
    case TODAY_GROUP.PAY:
      return { label: 'Pay vendor', works: false };
    case TODAY_GROUP.RECEIVE:
      return { label: 'Receive', works: false };
    case TODAY_GROUP.BILL:
      return { label: 'Create Invoice', works: false };
    case TODAY_GROUP.CALIBRATE:
      return { label: CALIBRATION_TEXT.TODAY_ACTION, works: false };
    case TODAY_GROUP.FOLLOW_UP:
      return { label: 'Open', works: false };
    case TODAY_GROUP.INDENTS:
      return { label: 'Open in Manage Indents', works: false };
    case TODAY_GROUP.DRAFTS:
      return { label: 'Continue', works: false };
  }
}

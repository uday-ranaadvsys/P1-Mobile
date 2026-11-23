import { DISCOUNT_TYPE } from 'floman-shared/constants';
import { itemAmounts, toPaise } from 'floman-shared/documentTotals';
import { noteLineLeft, noteLineOver, type NoteLine } from 'floman-shared/notes';
import { toISODate } from '@/components/DateField';
import { formatMoney } from '@/lib/format';
import type { DebitNote, DebitNoteItem } from './api';

/** One line of the note: a line of the GRN, with the quantity, rate and discount taken off it (typed as text). */
export type NoteRow = { sourceItemId: string; qty: string; unitPrice: string; discount: string; discountType: string };

/** What the header of the Debit Note form holds (the web form's note date, reason, the vendor's own note, Notes & terms, Summary). */
export type NoteHeader = {
  noteDate: string;
  reason: string;
  /** The vendor's own credit note for the same correction, when they send one. */
  partyNoteNumber: string;
  partyNoteDate: string;
  notes: string;
  terms: string;
  seriesId: string | null;
  extraDiscount: string;
  isRoundOff: boolean;
};

export type HeaderErrors = Partial<Record<'source' | 'noteDate' | 'reason' | 'lines', string>>;

export const newHeader = (): NoteHeader => ({ noteDate: toISODate(new Date()), reason: '', partyNoteNumber: '', partyNoteDate: '', notes: '', terms: '', seriesId: null, extraDiscount: '', isRoundOff: true });

const text = (value: number) => (value === 0 ? '' : String(Number(value.toFixed(2))));

/** The GRN's line as a note row: everything that was charged on it (nothing, when part of it is already taken off). */
export const rowOf = (line: NoteLine): NoteRow => ({
  sourceItemId: line.sourceItemId,
  qty: line.creditedTaxable > 0 ? '' : text(line.qty),
  unitPrice: text(line.unitPrice),
  discount: text(line.discount),
  discountType: line.discountType,
});

/** The web's checks on the header, in its words. */
export function headerErrors(h: NoteHeader, hasSource: boolean): HeaderErrors {
  const errors: HeaderErrors = {};
  if (!hasSource) errors.source = 'Please select the GRN this Debit Note is for.';
  if (!h.noteDate) errors.noteDate = 'Debit Note Date is required.';
  if (!h.reason.trim()) errors.reason = 'Please enter the reason for this Debit Note.';
  return errors;
}

const num = (value: string) => (Number.isFinite(parseFloat(value)) ? parseFloat(value) : 0);

/** A row priced like the GRN's line (the line's own GST rate). */
export const pricedRow = (row: NoteRow, line: NoteLine | undefined) => ({ qty: num(row.qty), unitPrice: num(row.unitPrice), discount: num(row.discount), discountType: row.discountType, taxRate: line?.taxRate ?? 0 });

/** The rows that take something off (quantity above 0). */
export const activeRows = (rows: NoteRow[]) => rows.filter((r) => num(r.qty) > 0);

/**
 * Why a row can't be saved, in the web's words: no rate, more than was received, or more than is left to take off the line.
 * `amounts`: the line's `netTaxableAmount` and `taxAmount` as worked out for the whole note.
 */
export function rowProblem(row: NoteRow, line: NoteLine | undefined, amounts: { netTaxableAmount: number; taxAmount: number } | undefined): string | null {
  if (!line || !amounts) return null;
  if (!(num(row.unitPrice) > 0)) return 'Enter the unit price.';
  const over = noteLineOver(line, num(row.qty), amounts);
  if (over.qty) return `Only ${line.qty} ${line.uom} was received.`;
  if (over.amount) return `Only ${formatMoney(noteLineLeft(line).taxable)} is left to debit on this line (before GST).`;
  return null;
}

/** A changed quantity takes its share of a line discount given in rupees (a % discount needs nothing). */
export function discountForQty(row: NoteRow, line: NoteLine | undefined, qty: number): string | null {
  if (!line || !(line.qty > 0) || row.discountType !== DISCOUNT_TYPE.AMOUNT || line.discountType !== DISCOUNT_TYPE.AMOUNT) return null;
  return text(toPaise((line.discount * Math.min(qty, line.qty)) / line.qty));
}

/** What a saved note line is, as a row. */
export const rowFromItem = (item: DebitNoteItem): NoteRow => ({
  sourceItemId: item.grnItemId ?? '',
  qty: text(Number(item.qty) || 0),
  unitPrice: text(Number(item.unitPrice) || 0),
  discount: text(Number(item.discount) || 0),
  discountType: item.discountType === DISCOUNT_TYPE.AMOUNT ? DISCOUNT_TYPE.AMOUNT : DISCOUNT_TYPE.PERCENTAGE,
});

/** What the header starts with from a saved note. */
export function headerFromNote(note: DebitNote): NoteHeader {
  return {
    noteDate: note.noteDate.slice(0, 10),
    reason: note.reason,
    partyNoteNumber: note.partyNoteNumber ?? '',
    partyNoteDate: note.partyNoteDate ? note.partyNoteDate.slice(0, 10) : '',
    notes: note.notes ?? '',
    terms: note.terms ?? '',
    seriesId: note.seriesId ?? null,
    extraDiscount: text(Number(note.extraDiscount) || 0),
    isRoundOff: note.isRoundOff !== false,
  };
}

/** Everything a save sends (the web's payload), for the status chosen: Draft, waiting for approval or approved. */
export function buildPayload(input: { header: NoteHeader; status: string; sendSeries: boolean; sourceId: string; rows: NoteRow[] }) {
  const { header: h } = input;
  return {
    seriesId: input.sendSeries ? h.seriesId : undefined,
    sourceId: input.sourceId,
    noteDate: h.noteDate,
    reason: h.reason.trim(),
    partyNoteNumber: h.partyNoteNumber.trim() || null,
    partyNoteDate: h.partyNoteDate || null,
    notes: h.notes.trim() || null,
    terms: h.terms.trim() || null,
    extraDiscount: num(h.extraDiscount),
    isRoundOff: h.isRoundOff,
    status: input.status,
    items: activeRows(input.rows).map((r) => ({ sourceItemId: r.sourceItemId, qty: num(r.qty), unitPrice: num(r.unitPrice), discount: num(r.discount), discountType: r.discountType })),
  };
}

export { itemAmounts };

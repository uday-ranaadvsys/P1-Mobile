import { INDENT_PRIORITY } from 'floman-shared/constants';
import { toISODate } from '@/components/DateField';
import type { Part } from '@/features/parts/api';
import { newLine, withRate, type FormLine } from '@/features/quotations/form';
import type { Indent, IndentItem } from './api';

/** What the header of the Indent form holds (the web form's Department & dates, Project details and Notes & terms). */
export type IndentHeader = {
  departmentId: string;
  priority: string;
  requiredByDate: string;
  reference: string;
  /** Our place the material is needed at; empty = the registered address. Its own series numbers the Indent. */
  shippingLocationId: string;
  seriesId: string | null;
  projectName: string;
  projectCode: string;
  notes: string;
  terms: string;
};

export type HeaderErrors = Partial<Record<'department' | 'requiredByDate', string>>;

/** A new Indent: normal priority, the requester's own department when they have one. */
export function newHeader(departmentId = ''): IndentHeader {
  return { departmentId, priority: INDENT_PRIORITY.MEDIUM, requiredByDate: '', reference: '', shippingLocationId: '', seriesId: null, projectName: '', projectCode: '', notes: '', terms: '' };
}

/** The web's checks on the header, in its words. */
export function headerErrors(h: IndentHeader): HeaderErrors {
  const errors: HeaderErrors = {};
  if (!h.departmentId) errors.department = 'Department is required';
  if (!h.requiredByDate) errors.requiredByDate = 'Required-By Date is required';
  return errors;
}

/** Whole days from today to the required-by date ("In 5 days"); none when it is empty or past. */
export function requiredInDays(h: Pick<IndentHeader, 'requiredByDate'>): number | null {
  if (!h.requiredByDate) return null;
  const days = Math.round((new Date(`${h.requiredByDate}T00:00:00`).getTime() - new Date(`${toISODate(new Date())}T00:00:00`).getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}
export const requiredText = (days: number) => (days === 0 ? 'Today' : `In ${days} ${days === 1 ? 'day' : 'days'}`);

/** A part picked for an Indent line: its name, code, unit and rate (an estimate); no GST on an Indent. */
export function withIndentPart(line: FormLine, part: Part): FormLine {
  const price = Number(part.sellingPriceWithoutTax) || Number(part.defaultPrice) || 0;
  return {
    ...withRate({ ...line, taxRate: 0 }, price ? String(Number(price.toFixed(2))) : ''),
    partId: part.id,
    partCode: part.code ?? null,
    partName: part.name,
    hsn: part.hsn || '',
    scope: part.description || line.scope || '',
    showSpecs: Boolean(part.description || line.scope),
    uom: part.uom || line.uom,
  };
}

const num = (text: string) => (Number.isFinite(parseFloat(text)) ? parseFloat(text) : 0);

/** The line as the server takes it (quantity, unit and an estimated rate). */
const linePayload = (l: FormLine) => ({
  ...(l.lineId && { id: l.lineId }),
  partId: l.partId || undefined,
  partName: l.partName.trim(),
  partCode: l.partCode || undefined,
  partDescription: undefined,
  qty: num(l.qty),
  uom: l.uom,
  estimatedUnitPrice: num(l.rate),
  estimatedTotal: num(l.qty) * num(l.rate),
  notes: l.scope.trim() || undefined,
});

/** Everything a save sends (the web's payload), for the status chosen: Draft or Submitted. */
export function buildPayload(input: { header: IndentHeader; status: string; sendSeries: boolean; lines: FormLine[] }) {
  const { header: h } = input;
  return {
    seriesId: input.sendSeries ? h.seriesId : undefined,
    departmentId: h.departmentId,
    priority: h.priority,
    requiredByDate: h.requiredByDate,
    projectName: h.projectName || undefined,
    projectCode: h.projectCode || undefined,
    reference: h.reference.trim() || null,
    shippingLocationId: h.shippingLocationId || null,
    notes: h.notes || undefined,
    termsAndConditions: h.terms || undefined,
    status: input.status,
    items: input.lines.map(linePayload),
  };
}

// ── A saved Indent back into the form (Edit, Duplicate) ───────────────────────

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');
const shown = (value: number) => (value === 0 ? '' : String(Number(value.toFixed(2))));

/** A saved line as a form line. `keep`: an edit keeps the line in place; a copy starts fresh. */
export function lineFromItem(it: IndentItem, keep: boolean): FormLine {
  const notes = it.notes || '';
  return {
    ...newLine(),
    lineId: keep ? it.id : null,
    partId: it.partId ?? null,
    partCode: it.partCode ?? null,
    partName: it.partName,
    hsn: it.hsn || '',
    scope: notes,
    showSpecs: Boolean(notes),
    qty: shown(Number(it.qty) || 0),
    uom: it.uom,
    rate: shown(Number(it.estimatedUnitPrice) || 0),
    rateWithTax: shown(Number(it.estimatedUnitPrice) || 0),
    taxRate: 0,
  };
}

/** What the form starts with from a saved Indent. A copy keeps the department, priority, project, lines and notes; the required-by date and the number are new. */
export function formFromIndent(indent: Indent, duplicate: boolean) {
  const header: IndentHeader = {
    departmentId: indent.departmentId ?? indent.department?.id ?? '',
    priority: indent.priority || INDENT_PRIORITY.MEDIUM,
    requiredByDate: duplicate ? '' : day(indent.requiredByDate),
    reference: indent.reference ?? '',
    shippingLocationId: indent.shippingLocationId ?? '',
    seriesId: duplicate ? null : indent.seriesId ?? null,
    projectName: indent.projectName ?? '',
    projectCode: indent.projectCode ?? '',
    notes: indent.notes ?? '',
    terms: indent.termsAndConditions ?? '',
  };
  // A cancelled line has nothing left to order: a copy leaves it out.
  const items = (indent.items ?? []).filter((it) => !(duplicate && it.status === 'CANCELLED'));
  const lines = items.map((it) => lineFromItem(it, !duplicate));
  return { header, lines: lines.length ? lines : [newLine()] };
}

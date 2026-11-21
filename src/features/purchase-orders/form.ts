import { DISCOUNT_TYPE } from 'floman-shared/constants';
import { partTaxRate } from 'floman-shared/gst';
import { calculateWithTax } from 'floman-shared/priceConversion';
import { toISODate } from '@/components/DateField';
import type { Part } from '@/features/parts/api';
import type { Party } from '@/features/parties/api';
import { PRIMARY } from '@/features/parties/places';
import { customPayload, newLine, withRate, withTaxRate, type FormLine } from '@/features/quotations/form';
import type { CustomFieldDefinition } from '@/features/documents/api';
import type { PurchaseOrder, PurchaseOrderItem } from './api';

/** What a Purchase Order's payment terms start as (the web: 'Net 30 Days'; an emptied box falls back to it on save). */
export const DEFAULT_PAYMENT_TERMS = 'Net 30 Days';

/** What the header of the Purchase Order form holds (the web form's Vendor & dates, Project and Notes & terms). */
export type PurchaseOrderHeader = {
  party: Party | null;
  /** The vendor's dispatch address (an address id), or PRIMARY. */
  dispatchFromId: string;
  /** The vendor's billing address (an address id); empty = its registered address. */
  billingAddressId: string;
  /** Our places; empty = the registered address. Bill to picks the numbering series. */
  billingLocationId: string;
  shippingLocationId: string;
  seriesId: string | null;
  orderDate: string;
  deliveryDueDate: string;
  expectedDeliveryDate: string;
  /** The vendor's own quote reference. */
  supplierQuote: string;
  paymentTerms: string;
  projectName: string;
  projectCode: string;
  clientName: string;
  notes: string;
  terms: string;
  /** The company's own fields, by field key. */
  customFields: Record<string, unknown>;
};

export type HeaderErrors = Partial<Record<'party' | 'orderDate', string>> & { custom?: Record<string, string> };

/** A new Purchase Order: today, nothing else chosen yet. */
export function newHeader(): PurchaseOrderHeader {
  return {
    party: null,
    dispatchFromId: PRIMARY,
    billingAddressId: '',
    billingLocationId: '',
    shippingLocationId: '',
    seriesId: null,
    orderDate: toISODate(new Date()),
    deliveryDueDate: '',
    expectedDeliveryDate: '',
    supplierQuote: '',
    paymentTerms: DEFAULT_PAYMENT_TERMS,
    projectName: '',
    projectCode: '',
    clientName: '',
    notes: '',
    terms: '',
    customFields: {},
  };
}

/** A custom field's value counts as filled in unless it is empty (a ticked or unticked box always does). */
const filledIn = (v: unknown) => v !== undefined && v !== null && v !== '';

/** The web's checks on the header, in its words. */
export function headerErrors(h: PurchaseOrderHeader, fields: CustomFieldDefinition[] = []): HeaderErrors {
  const errors: HeaderErrors = {};
  if (!h.party) errors.party = 'Please select a supplier/vendor.';
  if (!h.orderDate) errors.orderDate = 'Order Date is required';
  const custom: Record<string, string> = {};
  for (const f of fields) if (f.isRequired && f.fieldType !== 'checkbox' && !filledIn(h.customFields[f.fieldKey])) custom[f.fieldKey] = `${f.displayLabel} is required`;
  if (Object.keys(custom).length) errors.custom = custom;
  return errors;
}

/** Whole days from the order date to the delivery due date; none when either is missing or the order is wrong. */
export function dueInDays(h: Pick<PurchaseOrderHeader, 'orderDate' | 'deliveryDueDate'>): number | null {
  if (!h.orderDate || !h.deliveryDueDate) return null;
  const days = Math.round((new Date(`${h.deliveryDueDate}T00:00:00`).getTime() - new Date(`${h.orderDate}T00:00:00`).getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

/** "Same day", "1 day", "5 days": how long until delivery is due, after the Delivery due label. */
export const dueText = (days: number) => (days === 0 ? 'Same day' : `${days} ${days === 1 ? 'day' : 'days'}`);

// ── The items ────────────────────────────────────────────────────────────────

/** A part picked for a purchase line: its name, code, HSN, unit, rate and GST rate (the web's handleSelectCatalogItem).
 *  A vendor with no GSTIN charges no GST, so the line starts at 0% (still editable). */
export function withPurchasePart(line: FormLine, part: Part, fallbackRate: number, unregistered: boolean): FormLine {
  const taxRate = unregistered ? 0 : partTaxRate(part, fallbackRate);
  const price = Number(part.sellingPriceWithoutTax) || Number(part.defaultPrice) || 0;
  return {
    ...withRate({ ...line, taxRate }, price ? String(Number(price.toFixed(2))) : ''),
    partId: part.id,
    partCode: part.code ?? null,
    partName: part.name,
    hsn: part.hsn || '',
    scope: part.description || line.scope || '',
    showSpecs: Boolean(part.description || line.scope),
    uom: part.uom || line.uom,
  };
}

/** The lines when the vendor changes: one with no GSTIN puts every line at 0%; moving from such a vendor to one with a
 *  GSTIN puts each line back on its part's GST rate (fetched from the Part Master). */
export const zeroRated = (lines: FormLine[]): FormLine[] => lines.map((l) => withTaxRate(l, 0));

/** The web's checks on the lines, in its words: the first problem (a line key and the message), or none. */
export function lineProblem(lines: FormLine[]): { key: string; message: string } | null {
  const bad = lines.find((l) => !l.partName.trim() || !(Number(l.qty) > 0));
  if (bad) return { key: bad.key, message: 'Please provide a valid part name and positive quantity for all items.' };
  const noUom = lines.find((l) => !l.uom.trim());
  if (noUom) return { key: noUom.key, message: `UOM is mandatory. Please select a Unit of Measure for "${noUom.partName}".` };
  const noPart = lines.find((l) => !l.partId);
  if (noPart) return { key: noPart.key, message: `Pick "${noPart.partName}" from the Part Master list (or create it with "Edit part"), then save.` };
  return null;
}

const num = (text: string) => (Number.isFinite(parseFloat(text)) ? parseFloat(text) : 0);

/** The line as the server takes it. */
const linePayload = (l: FormLine) => ({
  ...(l.lineId && { lineId: l.lineId }),
  partId: l.partId || null,
  partCode: l.partCode || null,
  partName: l.partName,
  partDescription: l.scope.trim() || null,
  scopeOfWork: l.scope.trim() || null,
  hsn: l.hsn || null,
  qty: num(l.qty),
  freeQty: num(l.freeQty),
  uom: l.uom,
  unitPrice: num(l.rate),
  discount: num(l.discount),
  discountType: l.discountType,
  taxRate: l.taxRate,
});

/** Everything a save sends (the web's payload), for the status chosen: Draft, Submit for approval or Approve. */
export function buildPayload(input: {
  header: PurchaseOrderHeader;
  status: string;
  /** New and draft-numbered orders send their series; a numbered one keeps its own. */
  sendSeries: boolean;
  poNumber?: string;
  lines: FormLine[];
  fields: CustomFieldDefinition[];
  extraDiscount: string;
  isRoundOff: boolean;
  deductions: Record<string, unknown>;
}) {
  const { header: h } = input;
  return {
    poNumber: input.poNumber,
    seriesId: input.sendSeries ? h.seriesId : undefined,
    vendorId: h.party?.id,
    // The vendor's Dispatch from (none: its own, Primary), its Bill from, and our Bill to / Deliver to.
    shippingAddressId: h.dispatchFromId !== PRIMARY ? h.dispatchFromId : null,
    billingAddressId: h.billingAddressId || null,
    billingLocationId: h.billingLocationId || null,
    shippingLocationId: h.shippingLocationId || null,
    orderDate: h.orderDate,
    deliveryDueDate: h.deliveryDueDate || null,
    expectedDeliveryDate: h.expectedDeliveryDate || null,
    supplierQuote: h.supplierQuote || null,
    paymentTerms: h.paymentTerms || DEFAULT_PAYMENT_TERMS,
    projectName: h.projectName || null,
    projectCode: h.projectCode || null,
    clientName: h.clientName || null,
    notes: h.notes || null,
    terms: h.terms || null,
    extraDiscount: num(input.extraDiscount),
    isRoundOff: input.isRoundOff,
    // The TDS / TCS sections ticked (the server works out every amount).
    ...input.deductions,
    status: input.status,
    customFields: customPayload(input.fields, h.customFields),
    items: input.lines.map(linePayload),
  };
}

// ── A saved Purchase Order back into the form (Edit, Duplicate) ──────────────

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');
const shown = (value: number) => (value === 0 ? '' : String(Number(value.toFixed(2))));

/** A saved line as a form line. `keep`: an edit keeps the line in place (and the approver's remark on it); a copy starts fresh. */
export function lineFromItem(it: PurchaseOrderItem, keep: boolean): FormLine {
  const rate = Number(it.unitPrice) || 0;
  const taxRate = Number(it.taxRate) || 0;
  const scope = it.partDescription || it.scopeOfWork || '';
  return {
    ...newLine(),
    lineId: keep ? it.id : null,
    approverRemarks: keep ? it.approverRemarks || null : null,
    partId: it.partId ?? null,
    partCode: it.partCode ?? null,
    partName: it.partName,
    hsn: it.hsn || '',
    scope,
    showSpecs: Boolean(scope),
    qty: shown(Number(it.qty) || 0),
    freeQty: shown(Number(it.freeQty) || 0),
    uom: it.uom,
    rate: shown(rate),
    rateWithTax: shown(calculateWithTax(rate, taxRate)),
    discount: shown(Number(it.discount) || 0),
    discountType: it.discountType === DISCOUNT_TYPE.AMOUNT ? DISCOUNT_TYPE.AMOUNT : DISCOUNT_TYPE.PERCENTAGE,
    taxRate,
  };
}

/**
 * What the form starts with from a saved order. An edit keeps everything. A copy (`duplicate`) keeps the vendor, lines,
 * places and terms; the dates, the vendor's quote reference and the number are new (the order date is today).
 */
export function formFromPurchaseOrder(po: PurchaseOrder, party: Party | null, duplicate: boolean) {
  const fresh = newHeader();
  const header: PurchaseOrderHeader = {
    party,
    dispatchFromId: po.shippingAddressId || PRIMARY,
    billingAddressId: po.billingAddressId ?? '',
    billingLocationId: po.billingLocationId ?? '',
    shippingLocationId: po.shippingLocationId ?? '',
    seriesId: duplicate ? null : po.seriesId ?? null,
    orderDate: duplicate ? fresh.orderDate : day(po.orderDate) || fresh.orderDate,
    deliveryDueDate: duplicate ? '' : day(po.deliveryDueDate),
    expectedDeliveryDate: duplicate ? '' : day(po.expectedDeliveryDate),
    supplierQuote: duplicate ? '' : po.supplierQuote ?? '',
    paymentTerms: po.paymentTerms || DEFAULT_PAYMENT_TERMS,
    projectName: po.projectName ?? '',
    projectCode: po.projectCode ?? '',
    clientName: po.clientName ?? '',
    notes: po.notes ?? '',
    terms: po.terms ?? '',
    customFields: { ...(po.customFields ?? {}) },
  };
  const lines = (po.items ?? []).map((it) => lineFromItem(it, !duplicate));
  return {
    header,
    lines: lines.length ? lines : [newLine()],
    extraDiscount: shown(Number(po.extraDiscount) || 0),
    isRoundOff: po.isRoundOff !== false,
  };
}

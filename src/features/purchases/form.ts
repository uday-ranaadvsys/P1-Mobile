import { DISCOUNT_TYPE } from 'floman-shared/constants';
import { calculateWithTax } from 'floman-shared/priceConversion';
import { toISODate } from '@/components/DateField';
import type { CustomFieldDefinition } from '@/features/documents/api';
import type { Party } from '@/features/parties/api';
import { PRIMARY } from '@/features/parties/places';
import { customPayload, newLine, type FormLine } from '@/features/quotations/form';
import type { Purchase, PurchaseItem } from './api';

/** What the header of the Purchase form holds (the web form's Vendor & bill, Project and Notes & terms). */
export type PurchaseHeader = {
  party: Party | null;
  /** The vendor's dispatch address (an address id), or PRIMARY. */
  dispatchFromId: string;
  /** The vendor's billing address (an address id); empty = its registered address. */
  billingAddressId: string;
  /** Our places; empty = the registered address. Bill to picks the numbering series. */
  billingLocationId: string;
  shippingLocationId: string;
  seriesId: string | null;
  purchaseDate: string;
  billNumber: string;
  billDate: string;
  paymentTerms: string;
  projectName: string;
  projectCode: string;
  clientName: string;
  notes: string;
  terms: string;
  /** The company's own fields, by field key. */
  customFields: Record<string, unknown>;
};

export type HeaderErrors = Partial<Record<'party' | 'purchaseDate' | 'billNumber' | 'billDate', string>> & { custom?: Record<string, string> };

/** A new Purchase: today, nothing else chosen yet. */
export function newHeader(): PurchaseHeader {
  return {
    party: null,
    dispatchFromId: PRIMARY,
    billingAddressId: '',
    billingLocationId: '',
    shippingLocationId: '',
    seriesId: null,
    purchaseDate: toISODate(new Date()),
    billNumber: '',
    billDate: '',
    paymentTerms: '',
    projectName: '',
    projectCode: '',
    clientName: '',
    notes: '',
    terms: '',
    customFields: {},
  };
}

const filledIn = (v: unknown) => v !== undefined && v !== null && v !== '';

/** The web's checks on the header, in its words. A vendor with no GSTIN (a cash purchase) may have no bill: number and date optional. */
export function headerErrors(h: PurchaseHeader, fields: CustomFieldDefinition[], billOptional: boolean): HeaderErrors {
  const errors: HeaderErrors = {};
  if (!h.party) errors.party = 'Please select a supplier / vendor.';
  if (!billOptional && !h.billNumber.trim()) errors.billNumber = "Please enter the vendor's bill number.";
  if (!billOptional && !h.billDate) errors.billDate = "Please enter the vendor's bill date.";
  if (!h.purchaseDate) errors.purchaseDate = 'Order Date is required';
  const custom: Record<string, string> = {};
  for (const f of fields) if (f.isRequired && f.fieldType !== 'checkbox' && !filledIn(h.customFields[f.fieldKey])) custom[f.fieldKey] = `${f.displayLabel} is required`;
  if (Object.keys(custom).length) errors.custom = custom;
  return errors;
}

// ── The lines ────────────────────────────────────────────────────────────────

const n = (text: string) => (Number.isFinite(parseFloat(text)) ? parseFloat(text) : 0);
/** Two decimals, no trailing zeros. */
const shown = (value: number) => (value === 0 ? '' : String(Number(value.toFixed(2))));

/** The web's checks on the lines, in its words: the first problem (a line key and the message), or none. */
export function lineProblem(lines: FormLine[]): { key: string; message: string } | null {
  const bad = lines.find((l) => !l.partName.trim() || !(n(l.qty) > 0));
  if (bad) return { key: bad.key, message: 'Please provide a valid part name and positive quantity for all items.' };
  const noUom = lines.find((l) => !l.uom.trim());
  if (noUom) return { key: noUom.key, message: `Please select a valid UOM for item "${noUom.partName || 'Item'}"` };
  const noPart = lines.find((l) => !l.partId);
  if (noPart) return { key: noPart.key, message: `Pick "${noPart.partName}" from the Part Master list (or create it with "Edit part"), then save.` };
  return null;
}

/** The line as the server takes it (a Purchase has no separate scope of work: it is the part description). */
const linePayload = (l: FormLine) => ({
  ...(l.lineId && { lineId: l.lineId }),
  partId: l.partId || null,
  partName: l.partName.trim(),
  partCode: l.partCode || null,
  partDescription: l.scope.trim() || null,
  hsn: l.hsn || null,
  qty: n(l.qty),
  freeQty: n(l.freeQty),
  uom: l.uom,
  unitPrice: n(l.rate),
  discount: n(l.discount),
  discountType: l.discountType,
  taxRate: l.taxRate,
  indentRef: l.indentRef || null,
  // The indent shares a saved line holds stay as they are; the server gives back what is left out.
  indentAllocations: l.indentAllocations?.map((a) => ({ indentItemId: a.indentItemId, allocatedQty: Number(a.allocatedQty) })),
});

/** Everything a save sends (the web's payload), for the status chosen: Draft, Submit for approval or Approve. */
export function buildPayload(input: {
  header: PurchaseHeader;
  status: string;
  /** New and draft-numbered Purchases send their series; a numbered one keeps its own. */
  sendSeries: boolean;
  lines: FormLine[];
  fields: CustomFieldDefinition[];
  extraDiscount: string;
  isRoundOff: boolean;
  deductions: Record<string, unknown>;
  billAttachmentUrl: string | null;
  attachmentPaths?: unknown[];
}) {
  const { header: h } = input;
  return {
    seriesId: input.sendSeries ? h.seriesId : undefined,
    vendorId: h.party?.id,
    // The vendor's Dispatch from (none: its own, Primary), its Bill from, and our Bill to / Deliver to.
    shippingAddressId: h.dispatchFromId !== PRIMARY ? h.dispatchFromId : null,
    billingAddressId: h.billingAddressId || null,
    billingLocationId: h.billingLocationId || null,
    shippingLocationId: h.shippingLocationId || null,
    vendorBillNumber: h.billNumber.trim(),
    vendorBillDate: h.billDate || null,
    billAttachmentUrl: input.billAttachmentUrl,
    attachmentPaths: input.attachmentPaths,
    purchaseDate: h.purchaseDate,
    paymentTerms: h.paymentTerms || null,
    projectName: h.projectName || null,
    projectCode: h.projectCode || null,
    clientName: h.clientName || null,
    notes: h.notes || null,
    terms: h.terms || null,
    extraDiscount: n(input.extraDiscount),
    isRoundOff: input.isRoundOff,
    // The TDS / TCS sections ticked (the server works out every amount).
    ...input.deductions,
    status: input.status,
    customFields: customPayload(input.fields, h.customFields),
    items: input.lines.map(linePayload),
  };
}

// ── A saved Purchase back into the form (Edit, Duplicate) ────────────────────

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

/** A saved line as a form line. `keep`: an edit keeps the line in place and its indent shares; a copy starts fresh. */
export function lineFromItem(it: PurchaseItem, keep: boolean): FormLine {
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
    qty: shown(Number(it.qty) || 1),
    freeQty: shown(Number(it.freeQty) || 0),
    uom: it.uom,
    rate: shown(rate),
    rateWithTax: shown(calculateWithTax(rate, taxRate)),
    discount: shown(Number(it.discount) || 0),
    discountType: it.discountType === DISCOUNT_TYPE.AMOUNT ? DISCOUNT_TYPE.AMOUNT : DISCOUNT_TYPE.PERCENTAGE,
    taxRate,
    indentRef: keep ? it.indentRef ?? null : null,
    indentAllocations: keep && it.indentAllocations?.length ? it.indentAllocations.map((a) => ({ indentItemId: a.indentItemId, allocatedQty: Number(a.allocatedQty) })) : null,
  };
}

/**
 * What the form starts with from a saved Purchase. An edit keeps everything. A copy (`duplicate`) is a new standalone
 * Purchase: its own number, no indent lines; the vendor's bill, its date and attachment, and the dates are left for the user.
 */
export function formFromPurchase(p: Purchase, party: Party | null, duplicate: boolean) {
  const fresh = newHeader();
  const header: PurchaseHeader = {
    party,
    dispatchFromId: p.shippingAddressId || PRIMARY,
    billingAddressId: p.billingAddressId ?? '',
    billingLocationId: p.billingLocationId ?? '',
    shippingLocationId: p.shippingLocationId ?? '',
    seriesId: duplicate ? null : p.seriesId ?? null,
    purchaseDate: duplicate ? fresh.purchaseDate : day(p.purchaseDate) || fresh.purchaseDate,
    billNumber: duplicate ? '' : p.vendorBillNumber ?? '',
    billDate: duplicate ? '' : day(p.vendorBillDate),
    paymentTerms: p.paymentTerms ?? '',
    projectName: p.projectName ?? '',
    projectCode: p.projectCode ?? '',
    clientName: p.clientName ?? '',
    notes: p.notes ?? '',
    terms: p.terms ?? '',
    customFields: { ...(p.customFields ?? {}) },
  };
  const lines = (p.items ?? []).map((it) => lineFromItem(it, !duplicate));
  return {
    header,
    lines: lines.length ? lines : [newLine()],
    extraDiscount: shown(Number(p.extraDiscount) || 0),
    isRoundOff: p.isRoundOff !== false,
  };
}

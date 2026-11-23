import { DISCOUNT_TYPE } from 'floman-shared/constants';
import { calculateWithTax } from 'floman-shared/priceConversion';
import { toISODate } from '@/components/DateField';
import type { CustomFieldDefinition } from '@/features/documents/api';
import type { Party } from '@/features/parties/api';
import { PRIMARY } from '@/features/parties/places';
import type { PurchaseOrder, PurchaseOrderItem } from '@/features/purchase-orders/api';
import type { Purchase, PurchaseItem } from '@/features/purchases/api';
import { customPayload, newLine, type FormLine } from '@/features/quotations/form';
import type { Grn, GrnItem } from './api';

/** What the goods are received against: a Purchase Order (or none: direct) or a Purchase. */
export const RECEIVE_AGAINST = { PO: 'PO', PURCHASE: 'PUR' } as const;
export type ReceiveAgainst = (typeof RECEIVE_AGAINST)[keyof typeof RECEIVE_AGAINST];

/** The order or Purchase picked as the source, as much of it as the form shows. */
export type SourceRef = { id: string; number: string; date?: string | null; status?: string | null };

/** What the header of the GRN form holds (the web form's Vendor & bill, Project and Notes & terms). */
export type GrnHeader = {
  party: Party | null;
  /** The vendor's dispatch address (an address id), or PRIMARY. */
  dispatchFromId: string;
  /** The vendor's billing address (an address id); empty = its registered address. */
  billingAddressId: string;
  /** Our places; empty = the registered address. Bill to picks the numbering series. */
  billingLocationId: string;
  shippingLocationId: string;
  seriesId: string | null;
  receiveAgainst: ReceiveAgainst | null;
  purchaseOrder: SourceRef | null;
  purchase: SourceRef | null;
  billNumber: string;
  billDate: string;
  receivedDate: string;
  projectName: string;
  projectCode: string;
  clientName: string;
  notes: string;
  terms: string;
  /** The company's own fields, by field key. */
  customFields: Record<string, unknown>;
};

export type HeaderErrors = Partial<Record<'party' | 'against' | 'purchase' | 'billNumber' | 'billDate' | 'receivedDate', string>> & { custom?: Record<string, string> };

/** A new GRN: received today, nothing chosen yet. */
export function newHeader(): GrnHeader {
  const today = toISODate(new Date());
  return {
    party: null,
    dispatchFromId: PRIMARY,
    billingAddressId: '',
    billingLocationId: '',
    shippingLocationId: '',
    seriesId: null,
    receiveAgainst: null,
    purchaseOrder: null,
    purchase: null,
    billNumber: '',
    billDate: today,
    receivedDate: today,
    projectName: '',
    projectCode: '',
    clientName: '',
    notes: '',
    terms: '',
    customFields: {},
  };
}

const filledIn = (v: unknown) => v !== undefined && v !== null && v !== '';

/**
 * The web's checks on the header, in its words. A vendor with no GSTIN (a cash purchase) needs no source and no bill;
 * against a Purchase the bill is the Purchase's own.
 */
export function headerErrors(h: GrnHeader, fields: CustomFieldDefinition[], billOptional: boolean): HeaderErrors {
  const errors: HeaderErrors = {};
  if (!h.party) errors.party = 'Please select a supplier / vendor first.';
  if (!h.receiveAgainst && !billOptional) errors.against = 'Choose what the goods are received against.';
  if (h.receiveAgainst === RECEIVE_AGAINST.PURCHASE && !h.purchase) errors.purchase = 'Please pick a Purchase.';
  if (!h.purchase && !billOptional) {
    if (!h.billNumber.trim()) errors.billNumber = 'Vendor bill no. is required';
    if (!h.billDate) errors.billDate = 'Bill Date is required';
  }
  if (!h.receivedDate) errors.receivedDate = 'Received Date is required';
  const custom: Record<string, string> = {};
  for (const f of fields) if (f.isRequired && f.fieldType !== 'checkbox' && !filledIn(h.customFields[f.fieldKey])) custom[f.fieldKey] = `${f.displayLabel} is required`;
  if (Object.keys(custom).length) errors.custom = custom;
  return errors;
}

// ── The lines ────────────────────────────────────────────────────────────────

const n = (text: string) => (Number.isFinite(parseFloat(text)) ? parseFloat(text) : 0);
/** Two decimals, no trailing zeros. */
const shown = (value: number) => (value === 0 ? '' : String(Number(value.toFixed(2))));

/** What is still to come in on an order line: what was ordered less what GRNs that are not cancelled hold (drafts too). */
export const quantityLeft = (item: { qty: number | string; receivedQty?: number | string | null; heldQty?: number | string | null }) =>
  Math.max(0, Number(item.qty) - Math.max(Number(item.receivedQty || 0), Number(item.heldQty || 0)));

type SourceLine = PurchaseOrderItem | PurchaseItem;

/**
 * A line of the order or Purchase a GRN is made from (the tick rows): it starts at what is left to receive; one with
 * nothing left is offered unticked. `qty` of the form line is what comes in on this GRN.
 */
export function lineFromSource(item: SourceLine, source: 'PO' | 'PUR', qty?: number): FormLine {
  const left = quantityLeft(item);
  const rate = Number(item.unitPrice) || 0;
  const taxRate = Number(item.taxRate) || 0;
  const scope = item.partDescription || '';
  return {
    ...newLine(),
    partId: item.partId ?? null,
    partCode: item.partCode ?? null,
    partName: item.partName,
    hsn: item.hsn || '',
    scope,
    showSpecs: Boolean(scope),
    qty: shown(qty ?? left),
    uom: item.uom,
    rate: shown(rate),
    rateWithTax: shown(calculateWithTax(rate, taxRate)),
    discount: shown(Number(item.discount) || 0),
    discountType: item.discountType === DISCOUNT_TYPE.AMOUNT ? DISCOUNT_TYPE.AMOUNT : DISCOUNT_TYPE.PERCENTAGE,
    taxRate,
    selected: qty === undefined ? left > 0 : true,
    poItemId: source === 'PO' ? item.id : null,
    purchaseItemId: source === 'PUR' ? item.id : null,
    heldBy: item.heldBy ?? [],
  };
}

/** A line of a saved GRN as a form line. `keep`: an edit keeps the line in place; a copy starts fresh and standalone. */
export function lineFromGrnItem(it: GrnItem, keep: boolean): FormLine {
  const rate = Number(it.unitPrice) || 0;
  const taxRate = Number(it.taxRate) || 0;
  const onOrder = keep && (it.poItemId || it.purchaseItemId);
  return {
    ...newLine(),
    lineId: keep ? it.id : null,
    partId: it.partId ?? null,
    partCode: it.partCode ?? null,
    partName: it.partName,
    hsn: it.hsn || '',
    scope: it.partDescription || '',
    showSpecs: Boolean(it.partDescription),
    qty: shown(Number(it.inwardQty || it.qty) || 0),
    freeQty: shown(Number(it.freeQty) || 0),
    uom: it.uom,
    rate: shown(rate),
    rateWithTax: shown(calculateWithTax(rate, taxRate)),
    discount: shown(Number(it.discount) || 0),
    discountType: it.discountType === DISCOUNT_TYPE.AMOUNT ? DISCOUNT_TYPE.AMOUNT : DISCOUNT_TYPE.PERCENTAGE,
    taxRate,
    // A line of its PO / Purchase is ticked; a typed-in one has no tick.
    ...(onOrder && { selected: true }),
    poItemId: keep ? it.poItemId ?? null : null,
    purchaseItemId: keep ? it.purchaseItemId ?? null : null,
  };
}

/** A line is on the GRN when it was typed in, or it is a ticked order line. */
export const isOnGrn = (line: FormLine) => line.selected !== false;

/** The web's checks on the lines, in its words: the first problem (a line key and the message), or none. */
export function lineProblem(lines: FormLine[]): { key: string; message: string } | null {
  const active = lines.filter(isOnGrn);
  const bad = active.find((l) => !l.partName.trim() || !(n(l.qty) > 0));
  if (bad) return { key: bad.key, message: 'Please provide a valid part name and positive quantity for all inward items.' };
  const noUom = active.find((l) => !l.uom.trim());
  if (noUom) return { key: noUom.key, message: `UOM is mandatory. Please select a Unit of Measure for "${noUom.partName}".` };
  // Every line points at its Part Master part: picked here, or the part of the order / Purchase line it receives.
  const noPart = active.find((l) => !l.partId && !l.poItemId && !l.purchaseItemId);
  if (noPart) return { key: noPart.key, message: `Pick "${noPart.partName}" from the Part Master list (or create it with "Edit part"), then save.` };
  return null;
}

/** The line as the server takes it; a GRN line's quantity is what came in (inwardQty). */
const linePayload = (l: FormLine) => {
  const qty = n(l.qty) || 1;
  return {
    ...(l.lineId && { lineId: l.lineId }),
    partName: l.partName,
    partCode: l.partCode || null,
    partDescription: l.scope.trim() || null,
    hsn: l.hsn || null,
    qty,
    inwardQty: qty,
    freeQty: n(l.freeQty),
    uom: l.uom,
    unitPrice: n(l.rate),
    discount: n(l.discount),
    discountType: l.discountType,
    taxRate: l.taxRate,
    poItemId: l.poItemId || null,
    partId: l.partId || null,
    purchaseItemId: l.purchaseItemId || null,
  };
};

/** Everything a save sends (the web's payload), for the status chosen: Draft, Submit for approval or Received. */
export function buildPayload(input: {
  header: GrnHeader;
  status: string;
  grnNumber?: string;
  /** New and draft-numbered GRNs send their series; a numbered one keeps its own. */
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
    grnNumber: input.grnNumber,
    seriesId: input.sendSeries ? h.seriesId : undefined,
    vendorInvoiceNumber: h.billNumber.trim(),
    vendorInvoiceDate: h.billDate || null,
    grnDate: h.receivedDate || undefined,
    vendorId: h.party?.id,
    // The vendor's Dispatch from (none: its own, Primary), its Bill from, and our Bill to / Received at.
    shippingAddressId: h.dispatchFromId !== PRIMARY ? h.dispatchFromId : null,
    billingAddressId: h.billingAddressId || null,
    billingLocationId: h.billingLocationId || null,
    shippingLocationId: h.shippingLocationId || null,
    purchaseOrderId: h.purchase ? null : h.purchaseOrder?.id ?? null,
    // Advances are used with Pay / Payments now: never from the order on receipt.
    settleOrderAdvance: false,
    settleOrderAdvanceAmount: null,
    purchaseId: h.purchase?.id ?? null,
    billAttachmentUrl: input.billAttachmentUrl,
    attachmentPaths: input.attachmentPaths,
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
    items: input.lines.filter(isOnGrn).map(linePayload),
  };
}

// ── The source and a saved GRN back into the form ────────────────────────────

/** A Purchase Order as the source of a GRN: what the header takes from it, and its lines (each at what is left). */
export function fromPurchaseOrder(po: PurchaseOrder, party: Party | null) {
  return {
    header: {
      party,
      dispatchFromId: po.shippingAddressId || PRIMARY,
      billingAddressId: po.billingAddressId ?? '',
      billingLocationId: po.billingLocationId ?? '',
      shippingLocationId: po.shippingLocationId ?? '',
      receiveAgainst: RECEIVE_AGAINST.PO,
      purchaseOrder: { id: po.id, number: po.poNumber, date: po.orderDate ?? null, status: po.status } as SourceRef,
      purchase: null,
      projectName: po.projectName ?? '',
      projectCode: po.projectCode ?? '',
      clientName: po.clientName ?? '',
      notes: `Inward receipt against PO: ${po.poNumber}`,
    } satisfies Partial<GrnHeader>,
    lines: (po.items ?? []).map((it) => lineFromSource(it, 'PO')),
  };
}

/** A Purchase as the source of a GRN: its vendor and bill are used, no order is linked, each line starts at what is left. */
export function fromPurchase(pur: Purchase, party: Party | null) {
  return {
    header: {
      party,
      dispatchFromId: pur.shippingAddressId || PRIMARY,
      billingAddressId: pur.billingAddressId ?? '',
      billingLocationId: pur.billingLocationId ?? '',
      shippingLocationId: pur.shippingLocationId ?? '',
      receiveAgainst: RECEIVE_AGAINST.PURCHASE,
      purchaseOrder: null,
      purchase: { id: pur.id, number: pur.purchaseNumber, date: pur.purchaseDate ?? null, status: pur.status } as SourceRef,
      billNumber: pur.vendorBillNumber ?? '',
      billDate: pur.vendorBillDate ? pur.vendorBillDate.slice(0, 10) : '',
      projectName: pur.projectName ?? '',
      projectCode: pur.projectCode ?? '',
      clientName: pur.clientName ?? '',
      notes: `Inward receipt against Purchase: ${pur.purchaseNumber}`,
    } satisfies Partial<GrnHeader>,
    lines: (pur.items ?? []).map((it) => lineFromSource(it, 'PUR')),
  };
}

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

/**
 * What the form starts with from a saved GRN. An edit keeps everything. A copy (`duplicate`) is a new standalone GRN:
 * no order or Purchase, its own number; the vendor's bill, its date and attachment are left for the user.
 */
export function formFromGrn(g: Grn, party: Party | null, duplicate: boolean) {
  const fresh = newHeader();
  const header: GrnHeader = {
    party,
    dispatchFromId: g.shippingAddressId || PRIMARY,
    billingAddressId: g.billingAddressId ?? '',
    billingLocationId: g.billingLocationId ?? '',
    shippingLocationId: g.shippingLocationId ?? '',
    seriesId: duplicate ? null : g.seriesId ?? null,
    receiveAgainst: duplicate ? null : g.purchaseId ? RECEIVE_AGAINST.PURCHASE : RECEIVE_AGAINST.PO,
    purchaseOrder: !duplicate && g.purchaseOrder ? { id: g.purchaseOrder.id, number: g.purchaseOrder.poNumber, status: g.purchaseOrder.status ?? null } : null,
    purchase: !duplicate && g.purchase ? { id: g.purchase.id, number: g.purchase.purchaseNumber, status: g.purchase.status ?? null } : null,
    billNumber: duplicate ? '' : g.vendorInvoiceNumber ?? '',
    billDate: duplicate ? '' : day(g.vendorInvoiceDate),
    receivedDate: duplicate ? fresh.receivedDate : day(g.grnDate) || fresh.receivedDate,
    projectName: g.projectName ?? '',
    projectCode: g.projectCode ?? '',
    clientName: g.clientName ?? '',
    notes: g.notes ?? '',
    terms: g.terms ?? '',
    customFields: { ...(g.customFields ?? {}) },
  };
  const lines = (g.items ?? []).map((it) => lineFromGrnItem(it, !duplicate));
  return {
    header,
    lines: lines.length ? lines : [newLine()],
    extraDiscount: shown(Number(g.extraDiscount) || 0),
    isRoundOff: g.isRoundOff !== false,
  };
}

/** The lines of its PO / Purchase an edited GRN does not hold yet, with quantity left: offered unticked. */
export function offeredLines(items: SourceLine[], onIt: Set<string>, source: 'PO' | 'PUR'): FormLine[] {
  return items.filter((it) => !onIt.has(it.id) && quantityLeft(it) > 0).map((it) => ({ ...lineFromSource(it, source), selected: false }));
}

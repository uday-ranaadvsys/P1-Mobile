import { DISCOUNT_TYPE, SYSTEM_DEFAULTS } from 'floman-shared/constants';
import { isZeroRatedSupply, partTaxRate, SUPPLY_TYPE } from 'floman-shared/gst';
import { calculateWithoutTax, calculateWithTax } from 'floman-shared/priceConversion';
import { toISODate } from '@/components/DateField';
import type { Part } from '@/features/parts/api';
import type { Party, PartyAddress } from '@/features/parties/api';
import type { CustomFieldDefinition } from './api';

/** Sent for "Ship to" while the customer's own (Primary) address is chosen. */
export const PRIMARY = 'primary';

/** What the header of the Quotation form holds (the web form's Customer & dates, Project, Notes & terms). */
export type QuotationHeader = {
  party: Party | null;
  /** The customer's delivery address (an address id), or PRIMARY. */
  shipToId: string;
  /** The customer's billing address (an address id); empty = its registered address. */
  billingAddressId: string;
  /** Our places; empty = the registered address. Billing from picks the numbering series. */
  billingLocationId: string;
  shippingLocationId: string;
  seriesId: string | null;
  issueDate: string;
  validityDate: string;
  reference: string;
  supplyType: string;
  projectName: string;
  projectCode: string;
  clientName: string;
  notes: string;
  terms: string;
  /** The company's own fields, by field key. */
  customFields: Record<string, unknown>;
};

export type HeaderErrors = Partial<Record<'party' | 'issueDate' | 'validityDate' | 'series', string>> & { custom?: Record<string, string> };

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

/** A new Quotation: today, valid for the usual number of days, nothing chosen yet. */
export function newHeader(): QuotationHeader {
  const today = toISODate(new Date());
  return {
    party: null,
    shipToId: PRIMARY,
    billingAddressId: '',
    billingLocationId: '',
    shippingLocationId: '',
    seriesId: null,
    issueDate: today,
    validityDate: addDays(today, SYSTEM_DEFAULTS.DEFAULT_QUOTATION_VALIDITY_DAYS),
    reference: '',
    supplyType: SUPPLY_TYPE.B2B,
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

/** The web's checks on the header, in its words. `forApproval`: Submit / Approve asks for a different customer message. */
export function headerErrors(h: QuotationHeader, fields: CustomFieldDefinition[] = [], forApproval = false): HeaderErrors {
  const errors: HeaderErrors = {};
  if (!h.party) errors.party = forApproval ? 'Please select a target Customer to submit the Quotation for approval.' : 'Please select a Customer to save this Draft.';
  if (!h.issueDate) errors.issueDate = 'Issue Date is required';
  if (!h.validityDate) errors.validityDate = 'Validity Date is required';
  const custom: Record<string, string> = {};
  for (const f of fields) if (f.isRequired && f.fieldType !== 'checkbox' && !filledIn(h.customFields[f.fieldKey])) custom[f.fieldKey] = `${f.displayLabel} is required`;
  if (Object.keys(custom).length) errors.custom = custom;
  return errors;
}

// ── The items ────────────────────────────────────────────────────────────────

/** One line of the form. Numbers are kept as typed (text), so "12." and "0.0" can be typed. */
export type FormLine = {
  key: string;
  /** The Part Master part: every line needs one. */
  partId: string | null;
  partName: string;
  scope: string;
  showSpecs: boolean;
  qty: string;
  freeQty: string;
  uom: string;
  /** Before GST. */
  rate: string;
  /** Including GST: typing it works out `rate`, and the other way round. */
  rateWithTax: string;
  discount: string;
  discountType: string;
  taxRate: number;
};

let lineCounter = 0;
export const newLine = (): FormLine => ({
  key: `line-${Date.now()}-${lineCounter++}`,
  partId: null,
  partName: '',
  scope: '',
  showSpecs: false,
  qty: '',
  freeQty: '',
  uom: '',
  rate: '',
  rateWithTax: '',
  discount: '',
  discountType: DISCOUNT_TYPE.PERCENTAGE,
  taxRate: 0,
});

const n = (text: string) => {
  const v = parseFloat(text);
  return Number.isFinite(v) ? v : 0;
};

/** Two decimals, no trailing zeros ("1180", "1180.5"): what a worked-out rate shows. */
const shown = (value: number) => (value === 0 ? '' : String(Number(value.toFixed(2))));

/** A line's rate typed before GST: the rate with GST follows. */
export const withRate = (line: FormLine, rate: string): FormLine => ({ ...line, rate, rateWithTax: shown(calculateWithTax(n(rate), line.taxRate)) });

/** A line's rate typed with GST: the rate before GST follows. */
export const withRateWithTax = (line: FormLine, rateWithTax: string): FormLine => ({ ...line, rateWithTax, rate: shown(calculateWithoutTax(n(rateWithTax), line.taxRate)) });

/** A new GST rate on a line: the rate with GST is worked out again from the rate before GST. */
export const withTaxRate = (line: FormLine, taxRate: number): FormLine => ({ ...line, taxRate, rateWithTax: shown(calculateWithTax(n(line.rate), taxRate)) });

/** A part picked for a line: its name, unit, selling price and GST rate (the web's handleSelectCatalogItem). */
export function withPart(line: FormLine, part: Part, fallbackRate: number): FormLine {
  const taxRate = partTaxRate(part, fallbackRate);
  const price = Number(part.sellingPriceWithoutTax) || 0;
  return { ...line, partId: part.id, partName: part.name, uom: part.uom || line.uom, taxRate, rate: shown(price), rateWithTax: shown(calculateWithTax(price, taxRate)) };
}

/** A line as the shared calculation takes it; SEZ with LUT charges no GST, so its lines are priced at 0%. */
export const priced = (line: FormLine, exempt: boolean) => ({
  qty: n(line.qty),
  unitPrice: n(line.rate),
  discount: n(line.discount),
  discountType: line.discountType,
  taxRate: exempt ? 0 : line.taxRate,
});

/** What the lines' picked part looks like when a line is filled in (the web ignores lines with no name). */
export const usedLines = (lines: FormLine[]) => lines.filter((l) => l.partName.trim());

/** The web's checks on the lines, in its words: the first problem (a line key and the message), or none. */
export function lineProblem(lines: FormLine[], forApproval: boolean): { key: string; message: string } | null {
  const used = usedLines(lines);
  if (used.length === 0) return { key: lines[0]?.key ?? '', message: forApproval ? 'Please specify at least one valid line item before submitting for approval.' : 'Add at least one part from the Part Master.' };
  if (forApproval) {
    const noQty = used.find((l) => !(n(l.qty) > 0));
    if (noQty) return { key: noQty.key, message: `Quantity is mandatory. Please enter a valid quantity greater than 0 for "${noQty.partName}".` };
    const noUom = used.find((l) => !l.uom.trim());
    if (noUom) return { key: noUom.key, message: `UOM is mandatory. Please select a Unit of Measure for "${noUom.partName}".` };
  }
  const noPart = used.find((l) => !l.partId);
  if (noPart) return { key: noPart.key, message: `Pick "${noPart.partName}" from the Part Master list (or create it with "Edit part"), then save.` };
  return null;
}

/** The line as the server takes it. */
const linePayload = (l: FormLine, exempt: boolean, fallbackUom: string) => ({
  partName: l.partName,
  partId: l.partId,
  scopeOfWork: l.scope.trim() || undefined,
  qty: n(l.qty) || 1,
  freeQty: n(l.freeQty),
  uom: l.uom || fallbackUom,
  unitPrice: n(l.rate),
  discount: n(l.discount),
  discountType: l.discountType,
  taxRate: exempt ? 0 : l.taxRate,
});

/** A custom field's value for the server: numbers as numbers, nothing for a field left empty. */
const customPayload = (fields: CustomFieldDefinition[], values: Record<string, unknown>) =>
  Object.fromEntries(
    fields
      .filter((f) => f.fieldType === 'checkbox' || filledIn(values[f.fieldKey]))
      .map((f) => [f.fieldKey, f.fieldType === 'checkbox' ? Boolean(values[f.fieldKey]) : f.fieldType === 'number' ? Number(values[f.fieldKey]) : values[f.fieldKey]]),
  );

/** Everything a save sends (the web's payload), for the status chosen: Draft, Submit for approval or Approve. */
export function buildPayload(input: {
  header: QuotationHeader;
  status: string;
  number: string | undefined;
  lines: FormLine[];
  fields: CustomFieldDefinition[];
  extraDiscount: string;
  isRoundOff: boolean;
  deductions: Record<string, unknown>;
  fallbackUom: string;
}) {
  const { header: h, lines, fields } = input;
  const exempt = isZeroRatedSupply(h.supplyType);
  const text = (s: string) => s.trim() || undefined;
  return {
    quotationNumber: input.number,
    seriesId: h.seriesId,
    vendorId: h.party?.id,
    status: input.status,
    issueDate: h.issueDate,
    validityDate: h.validityDate,
    reference: text(h.reference),
    projectName: text(h.projectName),
    projectCode: text(h.projectCode),
    clientName: text(h.clientName),
    terms: text(h.terms),
    notes: text(h.notes),
    // The delivery address picked (none: the customer's own, Primary), in its own field.
    shippingAddressId: h.shipToId !== PRIMARY ? h.shipToId : null,
    billingAddressId: h.billingAddressId || null,
    billingLocationId: h.billingLocationId || null,
    shippingLocationId: h.shippingLocationId || null,
    customFields: customPayload(fields, h.customFields),
    extraDiscount: n(input.extraDiscount),
    isRoundOff: input.isRoundOff,
    ...input.deductions,
    supplyType: h.supplyType,
    items: usedLines(lines).map((l) => linePayload(l, exempt, input.fallbackUom)),
  };
}

/** Whole days from the issue date to the valid-until date; none when either is missing or the order is wrong. */
export function validForDays(h: Pick<QuotationHeader, 'issueDate' | 'validityDate'>): number | null {
  if (!h.issueDate || !h.validityDate) return null;
  const days = Math.round((new Date(`${h.validityDate}T00:00:00`).getTime() - new Date(`${h.issueDate}T00:00:00`).getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

// The party's places, as the web's document form lists them (client components/DocumentPlaces.tsx).
type HasAddresses = { addresses?: PartyAddress[] } | null | undefined;

/** The party's delivery addresses (what a Ship To can be). */
export const deliveryAddresses = (party: HasAddresses) => (party?.addresses ?? []).filter((a) => a.isActive !== false && a.isShipping !== false);

/** The party's billing addresses besides its registered one. */
export const billingAddresses = (party: HasAddresses) => (party?.addresses ?? []).filter((a) => a.isActive !== false && a.isBilling);

/** The id a new document ships to: the party's default delivery address, else Primary. */
export const defaultShipToId = (party: HasAddresses) => deliveryAddresses(party).find((a) => a.isDefault)?.id ?? PRIMARY;

/** "Plant 2 — Pune, Maharashtra" in a place list. */
export const placeChoice = (a: Pick<PartyAddress, 'label' | 'city' | 'state'>) => `${a.label || 'Place'} — ${a.city}${a.state ? `, ${a.state}` : ''}`;

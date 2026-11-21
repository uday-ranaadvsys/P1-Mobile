import { SYSTEM_DEFAULTS } from 'floman-shared/constants';
import { SUPPLY_TYPE } from 'floman-shared/gst';
import { toISODate } from '@/components/DateField';
import type { Party, PartyAddress } from '@/features/parties/api';

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
};

export type HeaderErrors = Partial<Record<'party' | 'issueDate' | 'validityDate' | 'series', string>>;

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
  };
}

/** The web's checks on the header, in its words. */
export function headerErrors(h: QuotationHeader): HeaderErrors {
  const errors: HeaderErrors = {};
  if (!h.party) errors.party = 'Please select a Customer to save this Draft.';
  if (!h.issueDate) errors.issueDate = 'Issue Date is required';
  if (!h.validityDate) errors.validityDate = 'Validity Date is required';
  return errors;
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

import { api, apiWithMessage, type Meta } from '@/api/client';

/** A delivery or billing place of a party (server: VendorAddress). */
export type PartyAddress = {
  id: string;
  label: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state?: string | null;
  pincode?: string | null;
  contactPerson?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  isDefault: boolean;
  isActive: boolean;
  isBilling?: boolean;
  isShipping?: boolean;
  gstin?: string | null;
  consigneeName?: string | null;
};

/** What goes to the server for an address (the form's fields). */
export type PartyAddressInput = Omit<PartyAddress, 'id' | 'isActive'> & { isActive?: boolean };

/** A customer or vendor (server: Vendor). The ledger and opening-balance fields only come for those allowed to see them. */
export type Party = {
  id: string;
  type: string;
  name: string;
  gstin: string | null;
  city: string;
  state: string | null;
  pincode: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  billToAddress: string;
  shipToAddress: string;
  supplyType: string;
  isActive: boolean;
  /** Documents have been made for it, so its GSTIN can no longer change. */
  gstinLocked?: boolean;
  /** What is owed today, in the ledger's sense: above zero they owe you, below zero you owe them. Null without the ledger. */
  balance?: number | null;
  openingBalance?: number | string;
  openingBalanceType?: string | null;
  openingBalanceDate?: string | null;
  addresses?: PartyAddress[];
};

/** The input of the party form (server: CreateVendorSchema). */
export type PartyInput = {
  type: string;
  name: string;
  gstin: string | null;
  city: string;
  state: string;
  pincode: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  billToAddress: string;
  shipToAddress: string;
  supplyType: string;
  openingBalance: number;
  openingBalanceType: string | null;
  openingBalanceDate: string | null;
  isActive?: boolean;
};

export type PartyFilters = {
  search?: string;
  type?: string;
  state?: string;
  gst?: string;
  status?: string;
  sort?: string;
  both?: boolean;
  missingDetails?: boolean;
};

export type PartyStats = { total: number; customers: number; vendors: number; both: number; missingDetails: number };

const query = (params: Record<string, string | number | boolean | undefined>) => {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== false);
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

/** One page of parties and the cards' counts (GET /vendors). */
export async function listParties(page: number, limit: number, f: PartyFilters) {
  const { data, meta } = await apiWithMessage<Party[]>(
    `/vendors${query({ page, limit, ...f, both: f.both || undefined, missingDetails: f.missingDetails || undefined })}`,
  );
  return { rows: data, meta: meta as (Meta & { stats?: PartyStats }) | null };
}

/** One party with its places, the deactivated ones too (the form lists them to reactivate). */
export const getParty = (id: string) => api<Party>(`/vendors/${id}?addresses=all`);

export const createParty = (body: PartyInput & { addresses: PartyAddressInput[] }) => api<Party>('/vendors', { method: 'POST', body });
export const updateParty = (id: string, body: PartyInput) => api<Party>(`/vendors/${id}`, { method: 'PUT', body });
export const setPartyActive = (id: string, isActive: boolean) => api<Party>(`/vendors/${id}/status`, { method: 'PATCH', body: { isActive } });

export const addAddress = (partyId: string, body: PartyAddressInput) => api<PartyAddress>(`/vendors/${partyId}/addresses`, { method: 'POST', body });
export const updateAddress = (partyId: string, addressId: string, body: Partial<PartyAddressInput>) =>
  api<PartyAddress>(`/vendors/${partyId}/addresses/${addressId}`, { method: 'PUT', body });
export const deactivateAddress = (partyId: string, addressId: string) => api<unknown>(`/vendors/${partyId}/addresses/${addressId}`, { method: 'DELETE' });

/** What the GST portal has registered for a GSTIN (server: whitebooks lookup). */
export type GstinInfo = {
  gstin: string;
  legalName: string;
  tradeName: string;
  city: string;
  state: string;
  pincode: string;
  address: string;
  street: string;
  isSez: boolean;
};
export const lookupGstin = (gstin: string) => api<GstinInfo>(`/vendors/gstin-lookup/${gstin}`);

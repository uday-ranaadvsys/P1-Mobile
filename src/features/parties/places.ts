import { toISODate } from '@/components/DateField';
import type { PartyAddress } from './api';

/** Sent for a delivery / dispatch address while the party's own (Primary) address is chosen. */
export const PRIMARY = 'primary';

/** A day (YYYY-MM-DD) some days on from another. */
export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

// The party's places, as the web's document forms list them (client components/DocumentPlaces.tsx).
type HasAddresses = { addresses?: PartyAddress[] } | null | undefined;

/** The party's delivery addresses (what a Ship To / Dispatch From can be). */
export const deliveryAddresses = (party: HasAddresses) => (party?.addresses ?? []).filter((a) => a.isActive !== false && a.isShipping !== false);

/** The party's billing addresses besides its registered one. */
export const billingAddresses = (party: HasAddresses) => (party?.addresses ?? []).filter((a) => a.isActive !== false && a.isBilling);

/** The id a new document ships to: the party's default delivery address, else Primary. */
export const defaultShipToId = (party: HasAddresses) => deliveryAddresses(party).find((a) => a.isDefault)?.id ?? PRIMARY;

/** "Plant 2 — Pune, Maharashtra" in a place list. */
export const placeChoice = (a: Pick<PartyAddress, 'label' | 'city' | 'state'>) => `${a.label || 'Place'} — ${a.city}${a.state ? `, ${a.state}` : ''}`;

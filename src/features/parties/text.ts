import { PARTY_TYPE, PAYMENT_TYPE, PAYMENT_TYPE_LABEL } from 'floman-shared/constants';
import { gstinOrUnregistered } from 'floman-shared/gst';
import { formatMoney } from '@/lib/format';
import type { Colors } from '@/theme';
import type { Party, PartyAddress } from './api';

/** What the two kinds of party are called on screen. */
export const PARTY_TYPE_LABEL: Record<string, string> = {
  [PARTY_TYPE.CUSTOMER]: 'Customer',
  [PARTY_TYPE.VENDOR]: 'Vendor',
};

export const gstinText = (party: { gstin: string | null }) => gstinOrUnregistered(party.gstin);

/** "Receive ₹10,000.00" (they owe you), "Pay ₹8,600.00" (you owe them), "Settled": the ledger's words (web: balanceInWords). */
export function balanceInWords(balance: number): string {
  if (!balance) return 'Settled';
  const word = balance > 0 ? PAYMENT_TYPE_LABEL[PAYMENT_TYPE.RECEIPT] : PAYMENT_TYPE_LABEL[PAYMENT_TYPE.PAYMENT];
  return `${word} ${formatMoney(Math.abs(balance))}`;
}

/** Only the balance is coloured: green when they owe you, red when you owe them (web: balanceTone). */
export const balanceColor = (balance: number, c: Colors) => (balance > 0 ? c.receive : balance < 0 ? c.danger : c.ink);

/** "Contact person · phone", or "No contact added" (the web's second line under a party's name). */
export const contactLine = (party: Pick<Party, 'contactPerson' | 'phone'>) => [party.contactPerson, party.phone].filter(Boolean).join(' · ') || 'No contact added';

export const placeLine = (party: Pick<Party, 'city' | 'state'>) => [party.city, party.state].filter(Boolean).join(', ') || '—';

/** An address on one line: place name first, then where it is. */
export const addressLine = (a: PartyAddress) =>
  [a.consigneeName, a.addressLine1, a.addressLine2, a.city, a.state, a.pincode, !a.isBilling && a.gstin ? `GSTIN ${a.gstin}` : null].filter(Boolean).join(', ');

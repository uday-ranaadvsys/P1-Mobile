import { api } from '@/api/client';
import type { LedgerOverview, PartyLedger } from 'floman-shared/ledger';

/** The period a ledger is asked for: both days included (YYYY-MM-DD). Empty = the server's own: this financial year up to today. */
export type LedgerPeriod = { from: string; to: string };

const query = (period: LedgerPeriod) => {
  const pairs = Object.entries(period).filter(([, v]) => v);
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
};

/** Every party with what is open and its balance at the end of the period (GET /ledger). */
export const getLedgerOverview = (period: LedgerPeriod) => api<LedgerOverview>(`/ledger${query(period)}`);

/** One party's statement for the period (GET /ledger/:vendorId). */
export const getPartyLedger = (vendorId: string, period: LedgerPeriod) => api<PartyLedger>(`/ledger/${vendorId}${query(period)}`);

/** The statement as a PDF (GET /ledger/:vendorId/pdf): the path `sharePdf` takes. */
export const ledgerPdfPath = (vendorId: string, period: LedgerPeriod) => `/ledger/${vendorId}/pdf${query(period)}`;

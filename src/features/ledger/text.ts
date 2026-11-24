import { LEDGER_ENTRY } from 'floman-shared/constants';
import type { Colors } from '@/theme';

/** Only the balance is coloured, so anyone reads it at a glance: green when they owe you, red when you owe them (the web's rule). */
export const balanceColor = (balance: number, colors: Colors) => (balance > 0 ? colors.receive : balance < 0 ? colors.danger : colors.ink);

/** A payment's lines (the money, its TDS, and expected TDS it removed) open that payment. */
export const isPaymentLine = (type: string) => type === LEDGER_ENTRY.RECEIPT || type === LEDGER_ENTRY.PAYMENT || type === LEDGER_ENTRY.TDS || type === LEDGER_ENTRY.TDS_REMOVED;

/** The mobile screen a document line opens (only the documents the app has; none for the rest yet). */
export const documentRoute = (type: string): '/purchase/grns/[id]' | '/purchase/debit-notes/[id]' | null =>
  type === LEDGER_ENTRY.GRN ? '/purchase/grns/[id]' : type === LEDGER_ENTRY.DEBIT_NOTE ? '/purchase/debit-notes/[id]' : null;

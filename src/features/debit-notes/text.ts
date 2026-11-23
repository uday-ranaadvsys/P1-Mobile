import { NOTE_STATUS } from 'floman-shared/statuses';
import { fileSafe } from '@/lib/fileName';
import type { DebitNote } from './api';

/** The unused pill: issued notes with an amount not linked or refunded yet (the web's UNUSED). */
export const UNUSED = 'UNUSED';

/**
 * A Debit Note's status as people read it (the web's STATUS_FILTER_OPTIONS in Notes.tsx; the saved codes stay as they
 * are). Copied here until the web moves it into shared/.
 */
export const STATUS_LABEL: Record<string, string> = {
  [NOTE_STATUS.DRAFT]: 'Draft',
  [NOTE_STATUS.PENDING_APPROVAL]: 'Waiting for approval',
  [NOTE_STATUS.RETURNED]: 'Returned',
  [NOTE_STATUS.APPROVED]: 'Approved',
  [UNUSED]: 'Unused',
  [NOTE_STATUS.CANCELLED]: 'Cancelled',
};
export const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

/** A note can be edited until it is issued (or cancelled); an approved one goes for approval again. */
export const EDITABLE: string[] = [NOTE_STATUS.DRAFT, NOTE_STATUS.PENDING_APPROVAL, NOTE_STATUS.RETURNED];

/** The PDF's file name: the note's own number (the slash as a look-alike, see fileSafe); "DN_" only when the number does not start with "DN". */
export const pdfName = (note: Pick<DebitNote, 'noteNumber'>) => {
  const safe = fileSafe(note.noteNumber);
  return `${/^DN/i.test(safe) ? '' : 'DN_'}${safe}.pdf`;
};

/** The GRN it is against, in a few words. */
export const sourceText = (note: Pick<DebitNote, 'grn'>) => (note.grn ? [note.grn.grnNumber, note.grn.vendorInvoiceNumber && `Bill ${note.grn.vendorInvoiceNumber}`].filter(Boolean).join(' · ') : '');

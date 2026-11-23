import { GRN_STATUS } from 'floman-shared/statuses';
import type { Purchase } from './api';

// A Purchase has the same statuses and words as a Purchase Order (Draft … Received, Cancelled), so its pills, status
// dot and "To receive" list come from features/purchase-orders (statusLabel, TO_RECEIVE, StatusPill).

/** Its GRNs that are not cancelled (drafts too): its Cancel waits for them, and its vendor stays. */
export const liveGrns = (p: Pick<Purchase, 'grns'>): string[] =>
  (p.grns ?? []).filter((g) => g.status !== GRN_STATUS.CANCELLED).map((g) => g.grnNumber).filter(Boolean);

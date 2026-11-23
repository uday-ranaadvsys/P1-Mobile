import { OVER_ORDER_CODE, QUANTITY_TEXT } from 'floman-shared/constants';
import { Alert } from 'react-native';
import { ApiError } from '@/api/client';

/** One line going over its order, as the server names it. */
type OverLine = { partName: string; ordered: number; total: number };
type OverDetails = { lines?: OverLine[]; verb?: string; source?: string };

/**
 * Quantity held by drafts: receiving or billing more than ordered (a GRN on a PO / Purchase, an invoice on a Sales
 * Order) asks first. `guard(call)` runs the save; when the server answers OVER_ORDER it shows the lines short
 * ("Bolt: Purchase Order 5, GRN 10.") with "Approve anyway", which sends it again with `confirmOverOrder`. "Go back"
 * resolves with `undefined` (nothing saved). The web's useOverOrderConfirm, as a phone alert.
 */
export async function guardOverOrder<T>(call: (confirmOverOrder: boolean) => Promise<T>, confirmText: string = QUANTITY_TEXT.APPROVE_ANYWAY): Promise<T | undefined> {
  try {
    return await call(false);
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== OVER_ORDER_CODE) throw e;
    const details = (e.details ?? {}) as OverDetails;
    const text = (details.lines ?? []).map((l) => QUANTITY_TEXT.overLine(l.partName, details.source ?? '', l.ordered, details.verb ?? '', l.total)).join('\n');
    const yes = await new Promise<boolean>((resolve) =>
      Alert.alert(
        QUANTITY_TEXT.OVER_TITLE,
        text,
        [
          { text: QUANTITY_TEXT.GO_BACK, style: 'cancel', onPress: () => resolve(false) },
          { text: confirmText, onPress: () => resolve(true) },
        ],
        { cancelable: false },
      ),
    );
    return yes ? call(true) : undefined;
  }
}

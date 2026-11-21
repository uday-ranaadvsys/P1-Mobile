import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { money } from '@/features/quotations/text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import type { PurchaseOrder } from '../api';
import { daysLate, lateText } from '../text';
import { StatusPill } from './StatusPill';

/**
 * One Purchase Order as a row, like the web's table row: its number and status, the vendor (and city), its date and
 * when it is due (late ones say so), and the grand total on the right. Tap opens it; long-press opens its actions.
 */
export function PurchaseOrderRow({ order: po, onOpen, onActions }: { order: PurchaseOrder; onOpen: () => void; onActions?: () => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const late = daysLate(po);
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onActions}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityHint={onActions ? 'Press and hold for actions' : undefined}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.body}>
        <Text style={styles.number} numberOfLines={1}>{po.poNumber}</Text>
        <Text style={styles.party} numberOfLines={1}>
          {po.vendor ? hide.text([po.vendor.name, po.vendor.city].filter(Boolean).join(' · ')) : '—'}
        </Text>
        <Text style={styles.small} numberOfLines={1}>
          {formatDate(po.orderDate)}
          {po.deliveryDueDate ? ` · Due ${formatDate(po.deliveryDueDate)}` : ''}
          {late > 0 ? <Text style={{ color: colors.warnText }}> · {lateText(late)}</Text> : null}
        </Text>
        <StatusPill status={po.status} edited={Boolean(po.editedAt)} />
      </View>
      <View style={styles.amount}>
        <Text style={styles.total}>{hide.hidden ? hide.rupees(0) : money(po.grandTotal)}</Text>
        <Text style={styles.small}>{Number(po.taxAmount) === 0 ? 'No GST' : 'incl. GST'}</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, minHeight: 72 },
    body: { flex: 1, gap: 3 },
    number: { ...type.headline, color: c.ink },
    party: { ...type.subhead, color: c.ink },
    small: { ...type.footnote, color: c.muted },
    amount: { alignItems: 'flex-end', gap: 2 },
    total: { ...type.headline, color: c.ink },
  });

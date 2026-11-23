import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { StatusPill } from '@/features/purchase-orders/components/StatusPill';
import { money } from '@/features/quotations/text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useThemed, type Colors } from '@/theme';
import type { Purchase } from '../api';

/**
 * One Purchase as a row, like the web's table row: its number and status, the vendor (and city), its date and the
 * vendor's bill number, and the grand total on the right. Tap opens it; long-press opens its actions.
 */
export function PurchaseRow({ purchase: p, onOpen, onActions }: { purchase: Purchase; onOpen: () => void; onActions?: () => void }) {
  const styles = useThemed(makeStyles);
  const hide = useHide();
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
        <Text style={styles.number} numberOfLines={1}>{p.purchaseNumber}</Text>
        <Text style={styles.party} numberOfLines={1}>
          {p.vendor ? hide.text([p.vendor.name, p.vendor.city].filter(Boolean).join(' · ')) : '—'}
        </Text>
        <Text style={styles.small} numberOfLines={1}>
          {formatDate(p.purchaseDate)}
          {p.vendorBillNumber ? ` · Bill ${p.vendorBillNumber}` : ''}
        </Text>
        <StatusPill status={p.status} edited={Boolean(p.editedAt)} />
      </View>
      <View style={styles.amount}>
        <Text style={styles.total}>{hide.hidden ? hide.rupees(0) : money(p.grandTotal)}</Text>
        <Text style={styles.small}>{Number(p.taxAmount) === 0 ? 'No GST' : 'incl. GST'}</Text>
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

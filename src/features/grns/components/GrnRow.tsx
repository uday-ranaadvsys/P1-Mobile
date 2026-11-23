import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { billOrNone } from 'floman-shared/constants';
import { money } from '@/features/quotations/text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import type { Grn } from '../api';
import { daysOverdue, overdueText } from '../text';
import { StatusPill } from './StatusPill';

/**
 * One GRN as a row, like the web's table row: its number and status, the vendor (and city), its date, the vendor's
 * bill and when payment is due (late ones say so), and the grand total on the right. Tap opens it; long-press opens
 * its actions.
 */
export function GrnRow({ grn, onOpen, onActions }: { grn: Grn; onOpen: () => void; onActions?: () => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const late = daysOverdue(grn);
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
        <Text style={styles.number} numberOfLines={1}>{grn.grnNumber}</Text>
        <Text style={styles.party} numberOfLines={1}>
          {grn.vendor ? hide.text([grn.vendor.name, grn.vendor.city].filter(Boolean).join(' · ')) : '—'}
        </Text>
        <Text style={styles.small} numberOfLines={1}>
          {formatDate(grn.grnDate)} · Bill: {billOrNone(grn.vendorInvoiceNumber)}
          {late > 0 ? <Text style={{ color: colors.warnText }}> · {overdueText(late)}</Text> : null}
        </Text>
        <StatusPill grn={grn} />
      </View>
      <View style={styles.amount}>
        <Text style={styles.total}>{hide.hidden ? hide.rupees(0) : money(grn.grandTotal)}</Text>
        <Text style={styles.small}>{Number(grn.taxAmount) === 0 ? 'No GST' : 'incl. GST'}</Text>
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

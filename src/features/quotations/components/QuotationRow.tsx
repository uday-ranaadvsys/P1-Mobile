import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useThemed, type Colors } from '@/theme';
import type { Quotation } from '../api';
import { CLOSED_STATUSES, daysLeft, money, quotationDate } from '../text';
import { StatusPill } from './StatusPill';

/**
 * One quotation as a row, like the web's table row: its number and status, the customer (and city), its date and how
 * long it stays valid, and the grand total on the right. Tap opens it.
 */
export function QuotationRow({ quotation: q, onOpen, onActions }: { quotation: Quotation; onOpen: () => void; onActions?: () => void }) {
  const styles = useThemed(makeStyles);
  const hide = useHide();
  const closed = CLOSED_STATUSES.includes(q.status);
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
        <Text style={styles.number} numberOfLines={1}>{q.quotationNumber}</Text>
        <Text style={styles.party} numberOfLines={1}>
          {q.vendor ? hide.text([q.vendor.name, q.vendor.city].filter(Boolean).join(' · ')) : '—'}
        </Text>
        <Text style={styles.small} numberOfLines={1}>
          {formatDate(quotationDate(q))}
          {q.validityDate && !closed ? ` · Valid until ${formatDate(q.validityDate)} · ${daysLeft(q.validityDate)}` : ''}
        </Text>
        <StatusPill status={q.status} edited={Boolean(q.editedAt)} />
      </View>
      <View style={styles.amount}>
        <Text style={styles.total}>{hide.hidden ? hide.rupees(0) : money(q.grandTotal)}</Text>
        <Text style={styles.small}>{Number(q.taxAmount) === 0 ? 'No GST' : 'incl. GST'}</Text>
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

import { PURCHASE_INDENT_STATUS } from 'floman-shared/statuses';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { money } from '@/features/quotations/text';
import { formatDate } from '@/lib/format';
import { useHide } from '@/lib/privacy';
import { spacing, type, useColors, useThemed, type Colors } from '@/theme';
import type { PurchaseIndent } from '../api';
import { daysLate, poOf, statusLabel } from '../text';

/** A Purchase Indent's status as a dot and a word (draft grey, waiting amber, converted green, returned red). */
export function StatusPill({ status }: { status: string }) {
  const colors = useColors();
  const tone: Record<string, string> = {
    [PURCHASE_INDENT_STATUS.DRAFT]: colors.muted,
    [PURCHASE_INDENT_STATUS.PENDING_APPROVAL]: colors.warnText,
    [PURCHASE_INDENT_STATUS.RETURNED]: colors.danger,
    [PURCHASE_INDENT_STATUS.APPROVED]: colors.receive,
    [PURCHASE_INDENT_STATUS.CONVERTED]: colors.receive,
    [PURCHASE_INDENT_STATUS.CANCELLED]: colors.muted,
  };
  const color = tone[status] ?? colors.muted;
  return (
    <View style={pill.row} accessible accessibilityLabel={`Status: ${statusLabel(status)}`}>
      <View style={[pill.dot, { backgroundColor: color }]} />
      <Text style={[type.footnoteBold, { color }]}>{statusLabel(status)}</Text>
    </View>
  );
}

const pill = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

/**
 * One Purchase Indent as a row: its number and status, the vendor, its date and when it is due, the Purchase Order it
 * became, and the grand total on the right. Tap opens it; long-press opens its actions.
 */
export function PurchaseIndentRow({ indent: pr, onOpen, onActions }: { indent: PurchaseIndent; onOpen: () => void; onActions?: () => void }) {
  const styles = useThemed(makeStyles);
  const colors = useColors();
  const hide = useHide();
  const late = daysLate(pr);
  const po = poOf(pr);
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
        <Text style={styles.number} numberOfLines={1}>{pr.prNumber}</Text>
        <Text style={styles.party} numberOfLines={1}>{pr.vendor ? hide.text([pr.vendor.name, pr.vendor.city].filter(Boolean).join(' · ')) : '—'}</Text>
        <Text style={styles.small} numberOfLines={1}>
          {formatDate(pr.orderDate)}
          {pr.deliveryDueDate ? ` · Due ${formatDate(pr.deliveryDueDate)}` : ''}
          {late > 0 ? <Text style={{ color: colors.warnText }}> · {late} {late === 1 ? 'day' : 'days'} late</Text> : null}
          {po ? ` · ${po.poNumber}` : ''}
        </Text>
        <StatusPill status={pr.status} />
      </View>
      <View style={styles.amount}>
        <Text style={styles.total}>{hide.hidden ? hide.rupees(0) : money(pr.grandTotal)}</Text>
        <Text style={styles.small}>{Number(pr.taxAmount) === 0 ? 'No GST' : 'incl. GST'}</Text>
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

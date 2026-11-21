import { QUOTATION_STATUS } from 'floman-shared/statuses';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { type, useColors } from '@/theme';
import { statusLabel } from '../text';

/** A quotation's status as a dot and a word, coloured as the web's badge (draft grey, waiting amber, answered green, bad red). */
export function StatusPill({ status, edited }: { status: string; edited?: boolean }) {
  const colors = useColors();
  const tone: Record<string, string> = {
    [QUOTATION_STATUS.DRAFT]: colors.muted,
    [QUOTATION_STATUS.PENDING_APPROVAL]: colors.warnText,
    [QUOTATION_STATUS.APPROVER_RETURNED]: colors.danger,
    [QUOTATION_STATUS.APPROVER_ACCEPTED]: colors.brandText,
    [QUOTATION_STATUS.CUSTOMER_PARTIALLY_ACCEPTED]: colors.receive,
    [QUOTATION_STATUS.CUSTOMER_ACCEPTED]: colors.receive,
    [QUOTATION_STATUS.CUSTOMER_REJECTED]: colors.danger,
    [QUOTATION_STATUS.CANCELLED]: colors.muted,
  };
  const color = tone[status] ?? colors.muted;
  // Edited after approval and waiting again: its own words, as on the web.
  const label = status === QUOTATION_STATUS.PENDING_APPROVAL && edited ? 'Edited, waiting for approval' : statusLabel(status);
  return (
    <View style={styles.row} accessible accessibilityLabel={`Status: ${label}`}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[type.footnoteBold, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
